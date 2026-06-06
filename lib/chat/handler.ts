import { isOriginAllowed } from "./origin.js";
import type { AgentResult } from "./agent.js";
import type { LanguageModel } from "ai";

export type RunAgentFn = (opts: {
  persona: string;
  userMessages: { role: "user" | "assistant"; content: string }[];
  model: LanguageModel;
  search?: any;
  maxRounds?: number;
}) => Promise<AgentResult>;

export interface HandlerDeps {
  runAgent: RunAgentFn;
  allowedOrigins: string;
  persona: string;
  model?: LanguageModel; // m3: typed via ai's LanguageModel instead of any
  search?: any; // always provided by api/chat.ts; optional for handler tests
  maxRounds?: number;
}

// ~1000 tokens per message — keeps history bounded even for very long messages
const MAX_MSG_LEN = 4000;

const CORS_HEADERS_WILDCARD: Record<string, string> = {
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function corsHeaders(origin: string | null, allowedOrigins: string): Record<string, string> {
  if (allowedOrigins === "*") {
    return {
      ...CORS_HEADERS_WILDCARD,
      "access-control-allow-origin": "*",
    };
  }
  const headers: Record<string, string> = { ...CORS_HEADERS_WILDCARD };
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return headers;
}

export async function handleChat(req: Request, deps: HandlerDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  const allowed = deps.allowedOrigins;

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin, allowed),
    });
  }

  // Method check — I2: return JSON body + CORS headers
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(origin, allowed),
      },
    });
  }

  // C1: Body-size guard via content-length header.
  // Note: content-length can be absent or spoofed by clients; Vercel enforces
  // its own hard limit. This is a well-behaved-client signal to reject
  // obviously oversized payloads early.
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null && parseInt(contentLength, 10) > 128 * 1024) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(origin, allowed),
      },
    });
  }

  // Origin check — same-origin requests have no Origin header and must pass
  // when allowed is "*"; non-browser clients can send any Origin, so this
  // is a browser-focused guardrail.
  if (!isOriginAllowed(origin ?? undefined, allowed)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Validate messages
  const raw = body as Record<string, unknown> | null;
  if (!raw || !Array.isArray(raw.messages) || raw.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages[] required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // C2+I1: Filter to user/assistant roles, sanitize content to string and cap
  // each message at MAX_MSG_LEN chars, then keep only the last 12 turns.
  const userMessages = (raw.messages as { role: string; content: unknown }[])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: (typeof m.content === "string" ? m.content : String(m.content ?? "")).slice(0, MAX_MSG_LEN),
    }))
    .slice(-12);

  // Call agent
  try {
    const result = await deps.runAgent({
      persona: deps.persona,
      userMessages,
      model: deps.model as LanguageModel,
      search: deps.search,
      maxRounds: deps.maxRounds,
    });

    // Opt-in, anonymous question analytics: only the question text (capped)
    // and the round count — no IP, no headers, no PII. Lands in the Vercel
    // function logs; used to learn what content is missing from the docs.
    if (raw.analyticsOptIn === true) {
      const lastUser = [...userMessages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        console.log(
          `ANALYTICS ${JSON.stringify({ q: lastUser.content.slice(0, 500), rounds: result.rounds })}`
        );
      }
    }

    return new Response(
      JSON.stringify({ answer: result.answer, citations: result.citations }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...corsHeaders(origin, allowed),
        },
      }
    );
  } catch (e: unknown) {
    console.error("chat_error", e instanceof Error ? e.message : e);
    // I5: include CORS headers on 500 so browser clients can read the error body
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(origin, allowed),
      },
    });
  }
}
