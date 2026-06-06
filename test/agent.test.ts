import { describe, it, expect, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { runAgent } from "../lib/chat/agent.js";

// ---------------------------------------------------------------------------
// Helpers to build LanguageModelV3GenerateResult fixtures
// ---------------------------------------------------------------------------

const mockUsage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function makeToolCallResult(toolCallId: string, toolName: string, input: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "tool-call", toolCallId, toolName, input }],
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage: mockUsage,
    warnings: [],
  };
}

function makeTextResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: mockUsage,
    warnings: [],
  };
}

// Note: MockLanguageModelV3 with doGenerate as array uses index = doGenerateCalls.length
// AFTER pushing the call, so first call returns doGenerate[1], second returns doGenerate[2].
// We place null at [0] as a placeholder.

describe("runAgent", () => {
  it("performs a tool call then returns a cited answer with deduped citations", async () => {
    const search = vi.fn(async (_q: string) => ({
      text: "Result 1:\nSource: https://www.asyncapi.com/docs/concepts\nSource Name: asyncapi-website\n\nAsyncAPI is an open source initiative.",
      citations: [{ url: "https://www.asyncapi.com/docs/concepts", source_name: "asyncapi-website", title: "Concepts" }],
    }));

    const model = new MockLanguageModelV3({
      doGenerate: [
        null as any, // placeholder at index 0 (not used)
        makeToolCallResult("t1", "search_docs", JSON.stringify({ query: "what is AsyncAPI" })),
        makeTextResult("AsyncAPI is an open source initiative for event-driven APIs."),
      ],
    });

    const r = await runAgent({
      persona: "You are a helpful researcher.",
      userMessages: [{ role: "user", content: "What is AsyncAPI?" }],
      model,
      search,
    });

    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith("what is AsyncAPI", 5);
    expect(r.answer).toContain("AsyncAPI is an open source initiative");
    expect(r.citations).toEqual([
      { url: "https://www.asyncapi.com/docs/concepts", source_name: "asyncapi-website", title: "Concepts" },
    ]);
    expect(r.rounds).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates citations when two tool calls return overlapping urls", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        text: "First result",
        citations: [
          { url: "https://www.asyncapi.com/docs/a", source_name: "asyncapi-website" },
          { url: "https://www.asyncapi.com/docs/b", source_name: "asyncapi-website" },
        ],
      })
      .mockResolvedValueOnce({
        text: "Second result",
        citations: [
          { url: "https://www.asyncapi.com/docs/b", source_name: "asyncapi-website" }, // duplicate
          { url: "https://www.asyncapi.com/docs/c", source_name: "asyncapi-website" },
        ],
      });

    const model = new MockLanguageModelV3({
      doGenerate: [
        null as any,
        makeToolCallResult("t1", "search_docs", JSON.stringify({ query: "channels" })),
        makeToolCallResult("t2", "search_docs", JSON.stringify({ query: "operations" })),
        makeTextResult("AsyncAPI has channels and operations."),
      ],
    });

    const r = await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "Tell me about channels" }],
      model,
      search,
    });

    // Should have 3 unique URLs, not 4
    expect(r.citations).toHaveLength(3);
    const urls = r.citations.map((c) => c.url);
    expect(urls).toContain("https://www.asyncapi.com/docs/a");
    expect(urls).toContain("https://www.asyncapi.com/docs/b");
    expect(urls).toContain("https://www.asyncapi.com/docs/c");
  });

  it("returns the fallback message when maxRounds is exhausted without text", async () => {
    // Model always returns tool calls, never final text
    const search = vi.fn(async (_q: string) => ({
      text: "some result",
      citations: [],
    }));

    const model = new MockLanguageModelV3({
      doGenerate: [
        null as any,
        makeToolCallResult("t1", "search_docs", JSON.stringify({ query: "q1" })),
        makeToolCallResult("t2", "search_docs", JSON.stringify({ query: "q2" })),
      ],
    });

    const r = await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "infinite loop question" }],
      model,
      search,
      maxRounds: 2,
    });

    expect(r.answer).toBe(
      "I couldn't complete the search in time. Please rephrase your question."
    );
  });

  it("returns rounds=1, empty citations, and the text when model answers directly without tool calls", async () => {
    const search = vi.fn();

    const model = new MockLanguageModelV3({
      doGenerate: [
        null as any,
        makeTextResult("AsyncAPI helps you describe event-driven APIs."),
      ],
    });

    const r = await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "Give me a quick summary of AsyncAPI." }],
      model,
      search,
    });

    expect(search).not.toHaveBeenCalled();
    expect(r.rounds).toBe(1);
    expect(r.citations).toEqual([]);
    expect(r.answer).toBe("AsyncAPI helps you describe event-driven APIs.");
  });

  it("passes citations through from search results", async () => {
    const expectedCitations = [
      { url: "https://www.asyncapi.com/docs/spec", source_name: "asyncapi-website", title: "Spec" },
    ];
    const search = vi.fn(async (_q: string) => ({
      text: "the spec says...",
      citations: expectedCitations,
    }));

    const model = new MockLanguageModelV3({
      doGenerate: [
        null as any,
        makeToolCallResult("t1", "search_docs", JSON.stringify({ query: "spec" })),
        makeTextResult("Here is what the spec says."),
      ],
    });

    const r = await runAgent({
      persona: "P",
      userMessages: [{ role: "user", content: "What does the spec say?" }],
      model,
      search,
    });

    expect(r.citations).toEqual(expectedCitations);
  });
});

// ---------------------------------------------------------------------------
// Resilience: search failures must not abort the request (no 500s),
// and the default round budget must not starve multi-search questions.
// ---------------------------------------------------------------------------

describe("runAgent resilience", () => {
  it("a throwing search does not reject — the error is surfaced to the model as tool output", async () => {
    const search = vi.fn(async () => {
      throw new Error("MCP backend unreachable");
    });

    const model = new MockLanguageModelV3({
      doGenerate: [
        null as any,
        makeToolCallResult("t1", "search_docs", JSON.stringify({ query: "anything" })),
        makeTextResult("The knowledge base is temporarily unavailable."),
      ],
    });

    const r = await runAgent({
      persona: "You are a helpful researcher.",
      userMessages: [{ role: "user", content: "What is AsyncAPI?" }],
      model,
      search,
    });

    expect(search).toHaveBeenCalledOnce();
    expect(r.answer).toBe("The knowledge base is temporarily unavailable.");
  });

  it("default round budget allows at least 10 tool rounds before the fallback", async () => {
    const search = vi.fn(async () => ({ text: "", citations: [] }));

    // 10 consecutive tool-call rounds, then a final text turn.
    const rounds = Array.from({ length: 10 }, (_, i) =>
      makeToolCallResult(`t${i}`, "search_docs", JSON.stringify({ query: `q${i}` }))
    );
    const model = new MockLanguageModelV3({
      doGenerate: [null as any, ...rounds, makeTextResult("Found it after extensive searching.")],
    });

    const r = await runAgent({
      persona: "You are a helpful researcher.",
      userMessages: [{ role: "user", content: "Deep question" }],
      model,
    });

    expect(r.answer).toBe("Found it after extensive searching.");
    expect(search).toHaveBeenCalledTimes(10);
  });
});
