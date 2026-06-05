import { describe, it, expect } from "vitest";
import { encodeVectors, decodeVectors, cosineTopK } from "../lib/search/vectors.js";

describe("vectors", () => {
  const vecs = [[1, 0], [0, 1], [0.6, 0.8]];
  it("round-trips encode/decode", () => {
    const buf = encodeVectors(vecs);
    expect(decodeVectors(buf, 2)).toEqual(vecs.map(v => Float32Array.from(v)));
  });
  it("ranks by cosine similarity", () => {
    const flat = decodeVectors(encodeVectors(vecs), 2);
    const top = cosineTopK(flat, Float32Array.from([0.7, 0.7]), 2);
    expect(top[0].index).toBe(2);
    expect(top).toHaveLength(2);
    expect(top[1].score).toBeCloseTo(0.7071, 3);
  });
  it("encodeVectors([]) returns zero-length Buffer", () => {
    const buf = encodeVectors([]);
    expect(buf.length).toBe(0);
  });
  it("decodeVectors(Buffer.alloc(0), 2) returns []", () => {
    expect(decodeVectors(Buffer.alloc(0), 2)).toEqual([]);
  });
  it("decodeVectors(anything, 0) returns []", () => {
    expect(decodeVectors(Buffer.alloc(16), 0)).toEqual([]);
  });
  it("cosineTopK([], q, 3) returns []", () => {
    expect(cosineTopK([], Float32Array.from([1, 0]), 3)).toEqual([]);
  });
});
