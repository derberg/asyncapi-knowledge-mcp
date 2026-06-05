export interface ScoredIndex { index: number; score: number; }

export function encodeVectors(vectors: number[][]): Buffer {
  const dims = vectors[0]?.length ?? 0;
  const buf = Buffer.alloc(vectors.length * dims * 4);
  vectors.forEach((v, i) => v.forEach((x, j) => buf.writeFloatLE(x, (i * dims + j) * 4)));
  return buf;
}

export function decodeVectors(buf: Buffer, dims: number): Float32Array[] {
  if (dims <= 0) return [];
  const count = Math.floor(buf.length / (dims * 4));
  // Float32Array uses platform byte order (little-endian on x86/ARM), which matches
  // writeFloatLE used on the encode side — acceptable for current deployment targets.
  // readFile returns a Buffer over a dedicated, 4-byte-aligned ArrayBuffer
  // (byteOffset 0); the copy branch handles any non-aligned Buffer just in case.
  const aligned = buf.byteOffset % 4 === 0;
  const all = aligned
    ? new Float32Array(buf.buffer, buf.byteOffset, count * dims)
    : new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + count * dims * 4));
  const out: Float32Array[] = [];
  for (let i = 0; i < count; i++) out.push(all.subarray(i * dims, (i + 1) * dims));
  return out;
}

export function cosineTopK(vectors: Float32Array[], query: Float32Array, k: number): ScoredIndex[] {
  let qn = 0;
  for (let j = 0; j < query.length; j++) qn += query[j] * query[j];
  qn = Math.sqrt(qn);
  const scored = vectors.map((v, index) => {
    let dot = 0, n = 0;
    for (let j = 0; j < v.length; j++) { dot += v[j] * query[j]; n += v[j] * v[j]; }
    return { index, score: dot / ((Math.sqrt(n) * qn) || 1) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
