import { generateText, tool, stepCountIs, type LanguageModel } from "ai";
import { z } from "zod";
import type { Citation, SearchFn } from "../search/index.js";

export interface AgentResult {
  answer: string;
  citations: Citation[];
  rounds: number;
}

export async function runAgent(opts: {
  persona: string;
  userMessages: { role: "user" | "assistant"; content: string }[];
  model: LanguageModel;
  search?: SearchFn; // optional in the type (handler plumbing) — required at runtime
  maxRounds?: number;
}): Promise<AgentResult> {
  const search = opts.search;
  if (!search) throw new Error("runAgent requires a search function (see buildDeps)");
  // Generous by default — a starved budget makes the agent give up with the
  // "couldn't complete the search" fallback while it is still mid-research.
  const maxRounds = opts.maxRounds ?? 16;
  const citations: Citation[] = [];

  const result = await generateText({
    model: opts.model,
    system: opts.persona,
    messages: opts.userMessages,
    stopWhen: stepCountIs(maxRounds),
    tools: {
      search_docs: tool({
        description:
          "Search the AsyncAPI documentation knowledge base (asyncapi.com docs + the AsyncAPI 3.1.0 JSON Schema). Use this for every factual question about AsyncAPI.",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const r = await search(query, 5);
          citations.push(...r.citations);
          return r.text;
        },
      }),
    },
  });

  const seen = new Set<string>();
  const deduped = citations.filter((c) =>
    c.url && !seen.has(c.url) ? (seen.add(c.url), true) : false
  );

  // Fallback covers both maxRounds exhaustion and the rare case where the
  // model ends its last step on a tool call with no subsequent text turn.
  const answer =
    result.text ||
    "I couldn't complete the search in time. Please rephrase your question.";

  // Note: steps ≠ tool invocations — a single step may batch multiple tool calls.
  return { answer, citations: deduped, rounds: result.steps.length };
}
