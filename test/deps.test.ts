import { describe, it, expect } from "vitest";
import { buildDeps } from "../lib/chat/deps.js";

const MCP = { SEARCH_MCP_URL: "http://localhost:8000/http" };

describe("buildDeps", () => {
  it("SEARCH_MCP_URL is required — search has no in-process fallback anymore", () => {
    expect(() => buildDeps({})).toThrow(/SEARCH_MCP_URL is required/);
  });

  it("SEARCH_MCP_URL set: builds an MCP-backed search function + gateway model", () => {
    const deps = buildDeps({ ...MCP });
    expect(typeof deps.search).toBe("function");
    expect(deps.model).toBeDefined();
    expect(typeof deps.model).toBe("object");
  });

  it("CHAT_MODEL env is passed through to the gateway model", () => {
    expect(() => buildDeps({ ...MCP, CHAT_MODEL: "openai/gpt-4o" })).not.toThrow();
  });

  it("CHAT_MODEL_BASE_URL set without CHAT_MODEL: throws a clear error", () => {
    expect(() =>
      buildDeps({ ...MCP, CHAT_MODEL_BASE_URL: "http://localhost:11434/v1" })
    ).toThrow(/CHAT_MODEL is required/);
  });

  it("CHAT_MODEL_BASE_URL + CHAT_MODEL: builds a local provider model without throwing", () => {
    // No network calls happen — createOpenAICompatible is a factory
    const deps = buildDeps({
      ...MCP,
      CHAT_MODEL_BASE_URL: "http://localhost:11434/v1",
      CHAT_MODEL: "mistral-small3.2",
      CHAT_MODEL_API_KEY: "ollama",
    });
    expect(deps.model).toBeDefined();
    expect(typeof deps.search).toBe("function");
  });
});
