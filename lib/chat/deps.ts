import { gateway } from "@ai-sdk/gateway";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { SearchFn } from "../search/index.js";
import { searchDocsViaMcp } from "../search/mcp-backend.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatDeps {
  model: LanguageModel;
  search: SearchFn;
}

// ---------------------------------------------------------------------------
// buildDeps — construct model + search backend from environment variables
//
// Env vars:
//   SEARCH_MCP_URL      — REQUIRED. OpenCrane MCP server for search_docs:
//                         the Hugging Face Space in production, a local
//                         `opencrane serve --transport http` in dev.
//   CHAT_MODEL_BASE_URL — if set, use an OpenAI-compatible endpoint (e.g. Ollama)
//   CHAT_MODEL          — required when CHAT_MODEL_BASE_URL is set
//   CHAT_MODEL_API_KEY  — optional API key (defaults to "ollama")
// ---------------------------------------------------------------------------

export function buildDeps(env: NodeJS.ProcessEnv): ChatDeps {
  // --- search backend -------------------------------------------------------
  const mcpUrl = env.SEARCH_MCP_URL;
  if (!mcpUrl) {
    throw new Error(
      "SEARCH_MCP_URL is required — point it at an OpenCrane MCP server.\n" +
        "  Production: SEARCH_MCP_URL=https://derberg-asyncapi-knowledge-mcp.hf.space/http\n" +
        "  Local dev:  SEARCH_MCP_URL=http://localhost:8000/http (opencrane serve --transport http)"
    );
  }
  const search: SearchFn = (q, k) => searchDocsViaMcp(q, mcpUrl, k);

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
