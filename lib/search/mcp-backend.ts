import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Citation, SearchResult } from "./index.js";

// ---------------------------------------------------------------------------
// parseCitations
// ---------------------------------------------------------------------------

// Parse the search_docs result text into citations. Each "Result N:" block
// carries Source (url) and Source Name lines; blocks missing either are
// skipped. Citations are deduped by url, first occurrence wins.
export function parseCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  for (const block of text.split(/^Result \d+:/m).slice(1)) {
    const url = block.match(/^Source:\s*(\S+)/m)?.[1];
    const source_name = block.match(/^Source Name:\s*([^\n]+)/m)?.[1]?.trim();
    if (!url || !source_name) continue;
    citations.push({ url, source_name });
  }
  const seen = new Set<string>();
  return citations.filter((c) =>
    c.url && !seen.has(c.url) ? (seen.add(c.url), true) : false
  );
}

// ---------------------------------------------------------------------------
// searchDocsViaMcp
// ---------------------------------------------------------------------------

export async function searchDocsViaMcp(
  query: string,
  mcpUrl: string,
  k = 5
): Promise<SearchResult> {
  const client = new Client(
    { name: "asyncapi-knowledge-chat", version: "0.1.0" },
    { capabilities: {} }
  );
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  await client.connect(transport);
  try {
    const res: any = await client.callTool({
      name: "search_docs",
      // OpenCrane's search_docs takes `limit` (our SearchFn signature calls it k)
      arguments: { query, limit: k },
    });
    const text = (res.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    return { text, citations: parseCitations(text) };
  } finally {
    await client.close();
  }
}
