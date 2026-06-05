import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { embed } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { decodeVectors, cosineTopK } from "./vectors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Citation {
  source_name: string;
  url: string;
  title?: string;
}

export interface SearchResult {
  text: string;
  citations: Citation[];
}

export interface IndexChunk {
  id: string;
  source: string;
  title: string;
  url: string;
  text: string;
}

export interface SearchIndex {
  dims: number;
  model: string;
  vectors: Float32Array[];
  chunks: IndexChunk[];
}

// ---------------------------------------------------------------------------
// formatResults
// ---------------------------------------------------------------------------

export function formatResults(chunks: IndexChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((chunk, i) => {
      return [
        `Result ${i + 1}:`,
        `Source: ${chunk.url}`,
        `Source Name: ${chunk.source}`,
        `Chunk ID: ${chunk.id}`,
        `Title: ${chunk.title}`,
        "",
        chunk.text,
      ].join("\n");
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// searchWithIndex (pure — no I/O, injectable embed fn for tests)
// ---------------------------------------------------------------------------

export async function searchWithIndex(
  index: SearchIndex,
  embedFn: (q: string) => Promise<Float32Array>,
  query: string,
  k = 5
): Promise<SearchResult> {
  if (index.chunks.length === 0) {
    return { text: "", citations: [] };
  }

  const queryVec = await embedFn(query);
  const topK = cosineTopK(index.vectors, queryVec, k);
  const topChunks = topK.map((scored) => index.chunks[scored.index]);

  const text = formatResults(topChunks);

  // Dedup citations by url — keep first occurrence
  const seenUrls = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of topChunks) {
    if (!seenUrls.has(chunk.url)) {
      seenUrls.add(chunk.url);
      citations.push({ source_name: chunk.source, url: chunk.url, title: chunk.title });
    }
  }

  return { text, citations };
}

// ---------------------------------------------------------------------------
// loadIndex — module-level cache; throws clear error when files are missing
// ---------------------------------------------------------------------------

interface MetaJson {
  model: string;
  dims: number;
  chunks: IndexChunk[];
}

// Promise-singleton: concurrent cold-start callers share one load.
// On rejection the promise is reset to null so a later call can retry.
let _indexPromise: Promise<SearchIndex> | null = null;

export async function loadIndex(): Promise<SearchIndex> {
  if (_indexPromise) return _indexPromise;

  _indexPromise = (async () => {
    const cwd = process.cwd();
    const p1 = join(cwd, "data", "vectors.meta.json");
    const p2 = join(fileURLToPath(import.meta.url), "..", "..", "..", "data", "vectors.meta.json");

    let metaPath: string | null = null;
    if (existsSync(p1)) {
      metaPath = p1;
    } else if (existsSync(p2)) {
      metaPath = p2;
    }

    if (!metaPath) {
      throw new Error(
        `vector index not found — run scripts/embed.mjs; looked in:\n  ${p1}\n  ${p2}`
      );
    }

    const metaDir = join(metaPath, "..");
    const binPath = join(metaDir, "vectors.bin");

    const metaText = await readFile(metaPath, "utf8");
    const meta: MetaJson = JSON.parse(metaText);

    const binBuf = await readFile(binPath);
    const vectors = decodeVectors(binBuf, meta.dims);

    if (vectors.length !== meta.chunks.length) {
      throw new Error(
        `index corrupt: vectors.bin has ${vectors.length} rows but vectors.meta.json has ${meta.chunks.length} chunks`
      );
    }

    return {
      dims: meta.dims,
      model: meta.model,
      vectors,
      chunks: meta.chunks,
    };
  })().catch((err) => {
    // Reset so a subsequent call can retry rather than returning a poisoned promise.
    _indexPromise = null;
    throw err;
  });

  return _indexPromise;
}

// ---------------------------------------------------------------------------
// embedQuery
// ---------------------------------------------------------------------------

export async function embedQuery(model: string, query: string): Promise<Float32Array> {
  const result = await embed({
    model: gateway.textEmbeddingModel(model),
    value: query,
  });
  return Float32Array.from(result.embedding);
}

// ---------------------------------------------------------------------------
// searchDocs — public API
// ---------------------------------------------------------------------------

export async function searchDocs(query: string, k = 5): Promise<SearchResult> {
  const index = await loadIndex();
  return searchWithIndex(index, (q) => embedQuery(index.model, q), query, k);
}
