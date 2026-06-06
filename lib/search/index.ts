// Shared search types. The actual search runs on the OpenCrane MCP server
// (the Hugging Face Space in production, a local `opencrane serve` in dev) —
// see mcp-backend.ts. There is no in-process vector index anymore.

export interface Citation {
  source_name: string;
  url: string;
  title?: string;
}

export interface SearchResult {
  text: string;
  citations: Citation[];
}

export type SearchFn = (query: string, k?: number) => Promise<SearchResult>;
