import { describe, it, expect } from "vitest";
import { formatResults, searchWithIndex, type SearchIndex } from "../lib/search/index.js";

const index: SearchIndex = {
  dims: 2,
  model: "openai/text-embedding-3-small",
  vectors: [Float32Array.from([1, 0]), Float32Array.from([0, 1])],
  chunks: [
    { id: "c1", source: "asyncapi-website", title: "Channels", url: "https://www.asyncapi.com/docs/concepts/channel", text: "Channels are..." },
    { id: "c2", source: "asyncapi-json-schema", title: "3.1.0 schema", url: "https://github.com/asyncapi/website/blob/master/config/3.1.0.json", text: "{...}" }
  ]
};

it("returns top-k chunks with citations", async () => {
  const res = await searchWithIndex(index, async () => Float32Array.from([1, 0]), "what are channels", 1);
  expect(res.citations).toEqual([{ source_name: "asyncapi-website", url: "https://www.asyncapi.com/docs/concepts/channel", title: "Channels" }]);
  expect(res.text).toContain("Result 1:");
  expect(res.text).toContain("Source: https://www.asyncapi.com/docs/concepts/channel");
  expect(res.text).toContain("Source Name: asyncapi-website");
  expect(res.text).toContain("Chunk ID: c1");
  expect(res.text).toContain("Channels are...");
});

it("k larger than chunk count returns all chunks without crashing", async () => {
  const res = await searchWithIndex(index, async () => Float32Array.from([1, 0]), "query", 100);
  expect(res.citations).toHaveLength(2);
  expect(res.text).toContain("Result 1:");
  expect(res.text).toContain("Result 2:");
});

it("citation dedup by url keeps first occurrence", async () => {
  const dupIndex: SearchIndex = {
    dims: 2,
    model: "openai/text-embedding-3-small",
    vectors: [Float32Array.from([1, 0]), Float32Array.from([0.9, 0.1]), Float32Array.from([0, 1])],
    chunks: [
      { id: "a1", source: "asyncapi-website", title: "Page A", url: "https://www.asyncapi.com/docs/page", text: "First chunk" },
      { id: "a2", source: "asyncapi-website", title: "Page A (dup)", url: "https://www.asyncapi.com/docs/page", text: "Second chunk same url" },
      { id: "b1", source: "asyncapi-json-schema", title: "Schema", url: "https://github.com/asyncapi/schema", text: "Schema chunk" }
    ]
  };
  const res = await searchWithIndex(dupIndex, async () => Float32Array.from([1, 0]), "query", 3);
  const urlCount = res.citations.filter(c => c.url === "https://www.asyncapi.com/docs/page").length;
  expect(urlCount).toBe(1);
  // Keeps first occurrence
  expect(res.citations[0]).toEqual({ source_name: "asyncapi-website", url: "https://www.asyncapi.com/docs/page", title: "Page A" });
});

it("formatResults numbering has Result 1 and Result 2", () => {
  const chunks = [
    { id: "c1", source: "asyncapi-website", title: "Channels", url: "https://www.asyncapi.com/docs/concepts/channel", text: "Channels are..." },
    { id: "c2", source: "asyncapi-json-schema", title: "3.1.0 schema", url: "https://github.com/asyncapi/website/blob/master/config/3.1.0.json", text: "{...}" }
  ];
  const text = formatResults(chunks);
  expect(text).toMatch(/^Result 1:/m);
  expect(text).toMatch(/^Result 2:/m);
});

it("empty index returns empty text and empty citations", async () => {
  const emptyIndex: SearchIndex = {
    dims: 2,
    model: "openai/text-embedding-3-small",
    vectors: [],
    chunks: []
  };
  const res = await searchWithIndex(emptyIndex, async () => Float32Array.from([1, 0]), "query", 5);
  expect(res.citations).toEqual([]);
  expect(res.text).toBe("");
});

it("searchWithIndex propagates embedFn rejection", async () => {
  const failEmbed = async (_q: string): Promise<Float32Array> => {
    throw new Error("embed-fail");
  };
  await expect(searchWithIndex(index, failEmbed, "query", 1)).rejects.toThrow("embed-fail");
});

it("k=0 returns empty text and no citations", async () => {
  const res = await searchWithIndex(index, async () => Float32Array.from([1, 0]), "query", 0);
  expect(res.text).toBe("");
  expect(res.citations).toEqual([]);
});
