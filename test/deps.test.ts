import { describe, it, expect } from "vitest";
import { buildDeps } from "../lib/chat/deps.js";
import { searchDocs } from "../lib/search/index.js";

describe("buildDeps", () => {
  it("defaults: uses gateway model and in-process search", () => {
    const deps = buildDeps({});
    // search should be the default in-process searchDocs function
    expect(deps.search).toBe(searchDocs);
    // model should be a LanguageModel object (not null/undefined)
    expect(deps.model).toBeDefined();
    expect(typeof deps.model).toBe("object");
  });

  it("CHAT_MODEL env is passed through to the gateway model", () => {
    // No error should be thrown; gateway just stores the model id
    expect(() => buildDeps({ CHAT_MODEL: "openai/gpt-4o" })).not.toThrow();
  });

  it("SEARCH_MCP_URL set: search is NOT the default in-process searchDocs", () => {
    const deps = buildDeps({ SEARCH_MCP_URL: "http://localhost:8000/mcp" });
    // The MCP-backed function is a different function reference
    expect(deps.search).not.toBe(searchDocs);
    expect(typeof deps.search).toBe("function");
  });

  it("CHAT_MODEL_BASE_URL set without CHAT_MODEL: throws a clear error", () => {
    expect(() =>
      buildDeps({ CHAT_MODEL_BASE_URL: "http://localhost:11434/v1" })
    ).toThrow(/CHAT_MODEL is required/);
  });

  it("CHAT_MODEL_BASE_URL + CHAT_MODEL: builds a local provider model without throwing", () => {
    // No network calls happen — createOpenAICompatible is a factory
    expect(() =>
      buildDeps({
        CHAT_MODEL_BASE_URL: "http://localhost:11434/v1",
        CHAT_MODEL: "mistral-small3.2",
      })
    ).not.toThrow();

    const deps = buildDeps({
      CHAT_MODEL_BASE_URL: "http://localhost:11434/v1",
      CHAT_MODEL: "mistral-small3.2",
      CHAT_MODEL_API_KEY: "ollama",
    });
    expect(deps.model).toBeDefined();
    expect(typeof deps.model).toBe("object");
  });

  it("CHAT_MODEL_BASE_URL + CHAT_MODEL: search defaults to in-process when SEARCH_MCP_URL absent", () => {
    const deps = buildDeps({
      CHAT_MODEL_BASE_URL: "http://localhost:11434/v1",
      CHAT_MODEL: "mistral-small3.2",
    });
    expect(deps.search).toBe(searchDocs);
  });

  it("both SEARCH_MCP_URL and CHAT_MODEL_BASE_URL set: mcp search + local model", () => {
    const deps = buildDeps({
      SEARCH_MCP_URL: "http://localhost:8000/mcp",
      CHAT_MODEL_BASE_URL: "http://localhost:11434/v1",
      CHAT_MODEL: "mistral-small3.2",
    });
    expect(deps.search).not.toBe(searchDocs);
    expect(deps.model).toBeDefined();
  });
});
