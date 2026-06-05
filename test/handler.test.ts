import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleChat } from "../lib/chat/handler.js";
import type { RunAgentFn } from "../lib/chat/handler.js";

// ---------------------------------------------------------------------------
// Fake runAgent for injection
// ---------------------------------------------------------------------------

const fakeAgentResult = {
  answer: "AsyncAPI is great.",
  citations: [{ url: "https://www.asyncapi.com/docs", source_name: "asyncapi-website" }],
  rounds: 2,
};

const fakeRunAgent: RunAgentFn = vi.fn(async () => fakeAgentResult);

// m4: reset shared mock call counts before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function optionsReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "OPTIONS",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("handleChat validation", () => {
  it("returns 400 when messages is missing", async () => {
    const res = await handleChat(makeReq({}), {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/messages/);
  });

  it("returns 400 when messages is empty array", async () => {
    const res = await handleChat(makeReq({ messages: [] }), {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/messages/);
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-valid-json{",
    });
    const res = await handleChat(req, {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(400);
  });

  it("returns 405 for non-POST non-OPTIONS methods", async () => {
    const req = new Request("http://localhost/api/chat", { method: "GET" });
    const res = await handleChat(req, {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(405);
  });

  // m5(e): 405 body is JSON with error field
  it("returns 405 with JSON body containing error field", async () => {
    const req = new Request("http://localhost/api/chat", { method: "DELETE" });
    const res = await handleChat(req, {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("content-type")).toBe("application/json");
    const json = await res.json();
    expect(json.error).toBe("method_not_allowed");
  });

  // m5(a): content-length > 128 KB → 413
  it("returns 413 when content-length exceeds 128 KB", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(200 * 1024), // 200 KB
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    const res = await handleChat(req, {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(413);
    expect(res.headers.get("content-type")).toBe("application/json");
    const json = await res.json();
    expect(json.error).toBe("payload_too_large");
    // CORS header must be present
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// CORS / OPTIONS tests
// ---------------------------------------------------------------------------

describe("handleChat CORS", () => {
  it("OPTIONS returns 204 when allowedOrigins is *", async () => {
    const res = await handleChat(optionsReq({ origin: "https://anydomain.com" }), {
      runAgent: fakeRunAgent,
      allowedOrigins: "*",
      persona: "P",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("OPTIONS returns 204 for allowlisted origin", async () => {
    const res = await handleChat(optionsReq({ origin: "https://chat.example.org" }), {
      runAgent: fakeRunAgent,
      allowedOrigins: "https://chat.example.org",
      persona: "P",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://chat.example.org");
  });

  it("POST without Origin header passes when allowedOrigins is * (same-origin requests)", async () => {
    const res = await handleChat(
      makeReq({ messages: [{ role: "user", content: "hi" }] }),
      { runAgent: fakeRunAgent, allowedOrigins: "*", persona: "P" }
    );
    expect(res.status).toBe(200);
  });

  it("POST with disallowed origin returns 403", async () => {
    const res = await handleChat(
      makeReq({ messages: [{ role: "user", content: "hi" }] }, { origin: "https://evil.com" }),
      { runAgent: fakeRunAgent, allowedOrigins: "https://chat.example.org", persona: "P" }
    );
    expect(res.status).toBe(403);
  });

  // m5(d): 500 response carries CORS header when origin is allowed
  it("returns 500 with access-control-allow-origin when origin is allowed and runAgent throws", async () => {
    const throwingAgent: RunAgentFn = vi.fn(async () => {
      throw new Error("unexpected");
    });

    const res = await handleChat(
      makeReq({ messages: [{ role: "user", content: "hi" }] }, { origin: "https://chat.example.org" }),
      { runAgent: throwingAgent, allowedOrigins: "https://chat.example.org", persona: "P" }
    );

    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://chat.example.org");
    const json = await res.json();
    expect(json.error).toBe("internal error");
  });
});

// ---------------------------------------------------------------------------
// History capping
// ---------------------------------------------------------------------------

describe("handleChat history capping", () => {
  it("caps history to the last 12 user/assistant turns", async () => {
    const runAgentSpy: RunAgentFn = vi.fn(async () => fakeAgentResult);

    // Build 20 messages alternating user/assistant
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message ${i}`,
    }));

    await handleChat(makeReq({ messages }), {
      runAgent: runAgentSpy,
      allowedOrigins: "*",
      persona: "P",
    });

    const callArgs = (runAgentSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.userMessages).toHaveLength(12);
  });

  it("filters out non-user/assistant messages", async () => {
    const runAgentSpy: RunAgentFn = vi.fn(async () => fakeAgentResult);
    const messages = [
      { role: "system", content: "system msg" },
      { role: "user", content: "hello" },
      { role: "tool", content: "tool result" },
      { role: "assistant", content: "hi there" },
    ];

    await handleChat(makeReq({ messages }), {
      runAgent: runAgentSpy,
      allowedOrigins: "*",
      persona: "P",
    });

    const callArgs = (runAgentSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.userMessages).toHaveLength(2);
    expect(callArgs.userMessages[0].role).toBe("user");
    expect(callArgs.userMessages[1].role).toBe("assistant");
  });

  // m5(b): message with numeric content is coerced to string "42"
  it("coerces non-string message content to string", async () => {
    const runAgentSpy: RunAgentFn = vi.fn(async () => fakeAgentResult);
    const messages = [{ role: "user", content: 42 }];

    await handleChat(makeReq({ messages }), {
      runAgent: runAgentSpy,
      allowedOrigins: "*",
      persona: "P",
    });

    const callArgs = (runAgentSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.userMessages[0].content).toBe("42");
  });

  // m5(c): message content longer than 4000 chars is truncated to 4000
  it("truncates message content to 4000 characters", async () => {
    const runAgentSpy: RunAgentFn = vi.fn(async () => fakeAgentResult);
    const longContent = "a".repeat(5000);
    const messages = [{ role: "user", content: longContent }];

    await handleChat(makeReq({ messages }), {
      runAgent: runAgentSpy,
      allowedOrigins: "*",
      persona: "P",
    });

    const callArgs = (runAgentSpy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.userMessages[0].content).toHaveLength(4000);
  });
});

// ---------------------------------------------------------------------------
// Success response
// ---------------------------------------------------------------------------

describe("handleChat success", () => {
  it("returns 200 with answer and citations from runAgent", async () => {
    const runAgentSpy: RunAgentFn = vi.fn(async () => fakeAgentResult);

    const res = await handleChat(
      makeReq({ messages: [{ role: "user", content: "What is AsyncAPI?" }] }),
      { runAgent: runAgentSpy, allowedOrigins: "*", persona: "P" }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.answer).toBe("AsyncAPI is great.");
    expect(json.citations).toEqual(fakeAgentResult.citations);
  });

  it("returns 500 on unexpected runAgent error without leaking details", async () => {
    const errorAgent: RunAgentFn = vi.fn(async () => {
      throw new Error("DB connection secret=abc123");
    });

    const res = await handleChat(
      makeReq({ messages: [{ role: "user", content: "hi" }] }),
      { runAgent: errorAgent, allowedOrigins: "*", persona: "P" }
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("internal error");
    // must not leak the internal message
    expect(JSON.stringify(json)).not.toContain("secret");
  });
});
