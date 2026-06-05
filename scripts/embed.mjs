#!/usr/bin/env node
/**
 * Embed script: reads .opencrane/chunks.json, produces data/vectors.bin + data/vectors.meta.json
 * using the Vercel AI Gateway embeddings API.
 *
 * Usage:
 *   node scripts/embed.mjs [--dry-run]
 *
 * Requires AI_GATEWAY_API_KEY (unless --dry-run).
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");
const MODEL = "openai/text-embedding-3-small";
// Dimensions are fixed by the embedding model: the gateway SDK exposes no way to
// request reduced dimensions (checked @ai-sdk/gateway v3 dist typings), so meta.dims
// must always match what text-embedding-3-small actually returns.
const DIMS = 1536;
const BATCH_SIZE = 100;
const MAX_TOKENS_PER_SEGMENT = 6000;
const CHARS_PER_TOKEN = 4; // rough estimate

// ---------------------------------------------------------------------------
// Binary vector encode — inline copy of lib/search/vectors.ts encodeVectors.
// (That file is TypeScript; this .mjs can't import it directly.)
// ---------------------------------------------------------------------------
function encodeVectors(vectors) {
  const dims = vectors[0]?.length ?? 0;
  const buf = Buffer.alloc(vectors.length * dims * 4);
  vectors.forEach((v, i) => v.forEach((x, j) => buf.writeFloatLE(x, (i * dims + j) * 4)));
  return buf;
}

// ---------------------------------------------------------------------------
// Chunk text derivation helpers
// ---------------------------------------------------------------------------

/**
 * Given a chunk object, return { id, source, title, url, text, hash }.
 * For oversized chunks this returns ONE item (splitting is done later).
 */
function deriveChunkFields(chunk) {
  const contentRaw = chunk.content;

  // Normalise content: object-type chunks (json_schema) → JSON stringify
  let rawText = typeof contentRaw === "string" ? contentRaw : JSON.stringify(contentRaw);

  // Extract leading ### https://... heading line
  let headingUrl = null;
  const headingMatch = rawText.match(/^### (https?:\/\/\S+)/);
  if (headingMatch) {
    headingUrl = headingMatch[1];
    // Strip the ENTIRE heading line (the URL may be followed by a trailing
    // section label, e.g. "### https://...md Ambassador duties") plus any
    // immediately following blank line.
    rawText = rawText.replace(/^[^\n]*\n?/, "").replace(/^\n/, "");
  }

  // Derive citation URL
  let url;
  if (chunk.source_name === "asyncapi-json-schema") {
    url = "https://github.com/asyncapi/website/blob/master/config/3.1.0.json";
  } else if (headingUrl) {
    // Strip trailing .md (the published asyncapi.com page is the path without .md)
    url = headingUrl.replace(/\.md$/, "");
  } else {
    url = chunk.metadata?.source_url ?? "";
  }

  // Derive source
  const source = chunk.source_name ?? "asyncapi-website";

  // Derive title:
  // 1. Try frontmatter title: in content
  let title = null;
  const frontmatterMatch = rawText.match(/^---\s*\ntitle:\s*['"]?(.*?)['"]?\s*\n/m);
  if (frontmatterMatch) {
    title = frontmatterMatch[1].trim();
  }
  if (!title && url) {
    // 2. Last path segment of URL, humanized
    try {
      const u = new URL(url);
      const pathParts = u.pathname.split("/").filter(Boolean);
      const lastSeg = pathParts[pathParts.length - 1] ?? "";
      if (lastSeg) {
        title = lastSeg
          .replace(/\.[^.]+$/, "") // strip extension
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    } catch {
      // invalid URL, fall through
    }
  }
  if (!title) {
    title = source;
  }

  const text = rawText;
  const hash = createHash("sha256").update(text).digest("hex");

  return { id: chunk.chunk_id, source, title, url, text, hash, tokenCount: chunk.token_count };
}

/**
 * Split a derived entry into segments of at most MAX_TOKENS_PER_SEGMENT tokens.
 * Returns an array of entries (may be length 1 if no split needed).
 */
function splitEntry(entry) {
  const estTokens = entry.tokenCount ?? Math.ceil(entry.text.length / CHARS_PER_TOKEN);
  if (estTokens <= MAX_TOKENS_PER_SEGMENT) {
    return [entry];
  }

  // Split on line boundaries, with a hard character-boundary fallback for lines
  // that are themselves longer than MAX_TOKENS_PER_SEGMENT.
  const rawLines = entry.text.split("\n");
  const lines = [];
  const maxLineChars = MAX_TOKENS_PER_SEGMENT * CHARS_PER_TOKEN;
  for (const line of rawLines) {
    if (Math.ceil(line.length / CHARS_PER_TOKEN) > MAX_TOKENS_PER_SEGMENT) {
      // Slice the oversized line into fixed-size character pieces.
      for (let start = 0; start < line.length; start += maxLineChars) {
        lines.push(line.slice(start, start + maxLineChars));
      }
    } else {
      lines.push(line);
    }
  }

  const segments = [];
  let current = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = Math.ceil(line.length / CHARS_PER_TOKEN);
    if (current.length > 0 && currentTokens + lineTokens > MAX_TOKENS_PER_SEGMENT) {
      segments.push(current.join("\n"));
      current = [line];
      currentTokens = lineTokens;
    } else {
      current.push(line);
      currentTokens += lineTokens;
    }
  }
  if (current.length > 0) segments.push(current.join("\n"));

  return segments.map((segText, idx) => ({
    id: `${entry.id}#seg${idx}`,
    source: entry.source,
    title: entry.title,
    url: entry.url,
    text: segText,
    hash: createHash("sha256").update(segText).digest("hex"),
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!DRY_RUN && !process.env.AI_GATEWAY_API_KEY) {
    console.error("ERROR: AI_GATEWAY_API_KEY is not set. Set it or use --dry-run.");
    process.exit(1);
  }

  // Read chunks
  const chunksPath = resolve(ROOT, ".opencrane/chunks.json");
  console.log(`Reading ${chunksPath} ...`);
  const chunksRaw = JSON.parse(await readFile(chunksPath, "utf8"));
  console.log(`  Loaded ${chunksRaw.length} chunks.`);

  // Derive fields for each chunk
  const derived = chunksRaw.map(deriveChunkFields);

  // Split oversized chunks
  const entries = derived.flatMap(splitEntry);
  console.log(`  After splitting: ${entries.length} segments.`);

  // Load existing meta for hash-based caching
  const metaPath = resolve(ROOT, "data/vectors.meta.json");
  const binPath = resolve(ROOT, "data/vectors.bin");

  let cachedEmbeddings = new Map(); // id+hash -> Float32Array
  try {
    const oldMeta = JSON.parse(await readFile(metaPath, "utf8"));
    const oldBin = await readFile(binPath);
    const oldDims = oldMeta.dims;
    const oldChunks = oldMeta.chunks;
    // Decode old vectors
    for (let i = 0; i < oldChunks.length; i++) {
      const c = oldChunks[i];
      const offset = i * oldDims * 4;
      const arr = new Float32Array(oldDims);
      for (let j = 0; j < oldDims; j++) {
        arr[j] = oldBin.readFloatLE(offset + j * 4);
      }
      cachedEmbeddings.set(`${c.id}::${c.hash}`, arr);
    }
    console.log(`  Loaded ${cachedEmbeddings.size} cached embeddings from existing files.`);
  } catch {
    console.log("  No existing cache found; will embed all segments.");
  }

  // Separate cache hits from entries needing embedding
  const toEmbed = [];
  const cacheHits = [];
  for (const entry of entries) {
    const key = `${entry.id}::${entry.hash}`;
    if (cachedEmbeddings.has(key)) {
      cacheHits.push(entry);
    } else {
      toEmbed.push(entry);
    }
  }

  // Estimate tokens for segments needing embedding
  const estimatedTokens = toEmbed.reduce(
    (sum, e) => sum + Math.ceil(e.text.length / CHARS_PER_TOKEN),
    0
  );
  const projectedSizeMB = ((entries.length * DIMS * 4) / (1024 * 1024)).toFixed(2);

  console.log(`  Cache hits: ${cacheHits.length}, to embed: ${toEmbed.length}`);
  console.log(`  Estimated tokens to embed: ${estimatedTokens.toLocaleString()}`);
  console.log(`  Model: ${MODEL}, dims: ${DIMS}`);
  console.log(`  Projected vectors.bin size: ${projectedSizeMB} MB`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN SUMMARY ---");
    console.log(`  Total chunks (raw):            ${chunksRaw.length}`);
    console.log(`  Segments after splitting:       ${entries.length}`);
    console.log(`  Cache hits (would skip):        ${cacheHits.length}`);
    console.log(`  Would embed:                    ${toEmbed.length}`);
    console.log(`  Estimated tokens for embedding: ${estimatedTokens.toLocaleString()}`);
    console.log(`  Model:                          ${MODEL}`);
    console.log(`  Dims:                           ${DIMS}`);
    console.log(`  Projected vectors.bin size:     ${projectedSizeMB} MB`);
    console.log("--- END DRY RUN ---");
    return;
  }

  // --- Actual embedding ---
  const { embedMany } = await import("ai");
  const { gateway } = await import("@ai-sdk/gateway");
  const model = gateway.textEmbeddingModel(MODEL);

  // Embed in batches
  const newEmbeddings = new Map(); // id+hash -> Float32Array
  let embeddedCount = 0;
  const total = toEmbed.length;

  let dimsChecked = false;
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map((e) => e.text);

    let result;
    try {
      result = await embedMany({ model, values: texts });
    } catch (err) {
      console.error(`\nERROR embedding batch starting at index ${i}:`, err.message);
      process.exit(1);
    }

    // Assert dims on the very first batch — before any output files are written.
    if (!dimsChecked) {
      const actualDims = result.embeddings[0].length;
      if (actualDims !== DIMS) {
        console.error(`ERROR: model returned ${actualDims} dims, expected ${DIMS}`);
        process.exit(1);
      }
      dimsChecked = true;
    }

    for (let b = 0; b < batch.length; b++) {
      const entry = batch[b];
      const vec = Float32Array.from(result.embeddings[b]);
      const key = `${entry.id}::${entry.hash}`;
      newEmbeddings.set(key, vec);
    }

    embeddedCount += batch.length;
    console.log(`  embedded ${embeddedCount}/${total} segments...`);
  }

  // Build final arrays in entries order
  const metaChunks = [];
  const allVectors = [];

  for (const entry of entries) {
    const key = `${entry.id}::${entry.hash}`;
    const vec = newEmbeddings.get(key) ?? cachedEmbeddings.get(key);
    if (!vec) {
      console.error(`ERROR: no embedding found for entry ${entry.id}`);
      process.exit(1);
    }
    metaChunks.push({
      id: entry.id,
      source: entry.source,
      title: entry.title,
      url: entry.url,
      text: entry.text,
      hash: entry.hash,
    });
    allVectors.push(Array.from(vec));
  }

  // Encode binary
  const binBuf = encodeVectors(allVectors);
  const meta = {
    model: MODEL,
    dims: DIMS,
    chunks: metaChunks,
  };

  // Write to temp files then rename (atomic)
  const dataDir = resolve(ROOT, "data");
  await mkdir(dataDir, { recursive: true });

  const tmpBin = binPath + ".tmp";
  const tmpMeta = metaPath + ".tmp";

  await writeFile(tmpBin, binBuf);
  await writeFile(tmpMeta, JSON.stringify(meta, null, 2));

  // Rename bin first, meta second: if a crash occurs between the two renames the
  // resulting count mismatch (bin rows ≠ meta chunks) is detectable on next load,
  // rather than silently leaving an inconsistent pair.
  await rename(tmpBin, binPath);
  await rename(tmpMeta, metaPath);

  console.log(`\nDone!`);
  console.log(`  Wrote ${binPath} (${(binBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`  Wrote ${metaPath} (${metaChunks.length} chunks)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
