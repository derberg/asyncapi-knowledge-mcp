import { gateway } from "@ai-sdk/gateway";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { searchDocs } from "../search/index.js";
import { searchDocsViaMcp } from "../search/mcp-backend.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatDeps {
  model: LanguageModel;
  search: typeof searchDocs;
}

// ---------------------------------------------------------------------------
// buildDeps — construct model + search backend from environment variables
//
// Env vars:
//   SEARCH_MCP_URL      — if set, use the local OpenCrane MCP server for search
//   CHAT_MODEL_BASE_URL — if set, use an OpenAI-compatible endpoint (e.g. Ollama)
//   CHAT_MODEL          — required when CHAT_MODEL_BASE_URL is set
//   CHAT_MODEL_API_KEY  — optional API key (defaults to "ollama")
// ---------------------------------------------------------------------------

export function buildDeps(env: NodeJS.ProcessEnv): ChatDeps {
  // --- search backend -------------------------------------------------------
  const mcpUrl = env.SEARCH_MCP_URL;
  const search: typeof searchDocs = mcpUrl
    ? (q: string, k?: number) => searchDocsViaMcp(q, mcpUrl, k)
    : searchDocs;

  // --- model ----------------------------------------------------------------
  const baseURL = env.CHAT_MODEL_BASE_URL;
  let model: LanguageModel;

  if (baseURL) {
    const modelId = env.CHAT_MODEL;
    if (!modelId) {
      throw new Error(
        "CHAT_MODEL is required when CHAT_MODEL_BASE_URL is set.\n" +
          "  Example: CHAT_MODEL=mistral-small3.2 CHAT_MODEL_BASE_URL=http://localhost:11434/v1"
      );
    }
    const provider = createOpenAICompatible({
      name: "local",
      baseURL,
      apiKey: env.CHAT_MODEL_API_KEY ?? "ollama",
    });
    model = provider.chatModel(modelId);
  } else {
    const modelId = env.CHAT_MODEL ?? "openai/gpt-5-nano";
    model = gateway(modelId);
  }

  return { model, search };
}
