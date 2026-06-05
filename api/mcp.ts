import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { searchDocs } from "../lib/search/index.js";

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "search_docs",
      "Search the AsyncAPI documentation knowledge base (asyncapi.com docs + the AsyncAPI 3.1.0 JSON Schema). Returns relevant doc chunks with source name and URL. Use this for every factual question about AsyncAPI.",
      { query: z.string().describe("The search query.") },
      async ({ query }) => {
        const res = await searchDocs(query, 5);
        return { content: [{ type: "text" as const, text: res.text }] };
      }
    );
  },
  {},
  // The handler matches the request path against basePath + "/mcp"; this file
  // serves /api/mcp, so basePath must be "/api" (without it the handler 404s).
  { basePath: "/api" }
);

export default handler;
