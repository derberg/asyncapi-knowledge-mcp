import { describe, it, expect } from "vitest";
import { parseCitations } from "../lib/search/mcp-backend.js";

const sample = `
Result 1:
Source: https://www.asyncapi.com/docs/concepts
Source Name: asyncapi-website
Chunk ID: asyncapi-website--concepts--001

AsyncAPI is an open source initiative.

Result 2:
Source: https://www.asyncapi.com/docs/tutorials
Source Name: asyncapi-website
Chunk ID: asyncapi-website--tutorials--001

Here are some tutorials.

Result 3:
Source: https://raw.githubusercontent.com/asyncapi/website/master/config/3.1.0.json
Source Name: asyncapi-json-schema
Chunk ID: asyncapi-json-schema--001

The JSON Schema for AsyncAPI 3.1.0.
`.trim();

describe("parseCitations", () => {
  it("parses multiple result blocks into citations", () => {
    const citations = parseCitations(sample);
    expect(citations).toHaveLength(3);
    expect(citations[0]).toEqual({
      url: "https://www.asyncapi.com/docs/concepts",
      source_name: "asyncapi-website",
    });
    expect(citations[1]).toEqual({
      url: "https://www.asyncapi.com/docs/tutorials",
      source_name: "asyncapi-website",
    });
    expect(citations[2]).toEqual({
      url: "https://raw.githubusercontent.com/asyncapi/website/master/config/3.1.0.json",
      source_name: "asyncapi-json-schema",
    });
  });

  it("skips blocks that are missing Source", () => {
    const text = `
Result 1:
Source Name: asyncapi-website
Chunk ID: foo

No url here.

Result 2:
Source: https://www.asyncapi.com/docs/concepts
Source Name: asyncapi-website

Has url.
`.trim();
    const citations = parseCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].url).toBe("https://www.asyncapi.com/docs/concepts");
  });

  it("skips blocks that are missing Source Name", () => {
    const text = `
Result 1:
Source: https://www.asyncapi.com/docs/concepts
Chunk ID: foo

No source name here.

Result 2:
Source: https://www.asyncapi.com/docs/tutorials
Source Name: asyncapi-website

Has source name.
`.trim();
    const citations = parseCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].url).toBe("https://www.asyncapi.com/docs/tutorials");
  });

  it("deduplicates by url, keeping first occurrence", () => {
    const text = `
Result 1:
Source: https://www.asyncapi.com/docs/concepts
Source Name: asyncapi-website

First occurrence.

Result 2:
Source: https://www.asyncapi.com/docs/tutorials
Source Name: asyncapi-website

Unique.

Result 3:
Source: https://www.asyncapi.com/docs/concepts
Source Name: asyncapi-website

Duplicate — should be dropped.
`.trim();
    const citations = parseCitations(text);
    expect(citations).toHaveLength(2);
    expect(citations[0].url).toBe("https://www.asyncapi.com/docs/concepts");
    expect(citations[1].url).toBe("https://www.asyncapi.com/docs/tutorials");
  });

  it("deep-links to the section anchor when the block content carries one", () => {
    const text = `
Result 1:
Source: https://www.asyncapi.com/docs/reference/specification/v3.1.0
Source Name: asyncapi-website

### <a name="runtimeExpression"></a>Runtime Expression

A runtime expression allows values to be defined based on information…
`.trim();
    const citations = parseCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].url).toBe(
      "https://www.asyncapi.com/docs/reference/specification/v3.1.0#runtimeExpression"
    );
  });

  it("leaves the url untouched when the block has no anchor", () => {
    const text = `
Result 1:
Source: https://www.asyncapi.com/docs/concepts
Source Name: asyncapi-website

Plain prose, no anchor tag.
`.trim();
    expect(parseCitations(text)[0].url).toBe("https://www.asyncapi.com/docs/concepts");
  });

  it("returns empty array for empty string", () => {
    expect(parseCitations("")).toEqual([]);
  });

  it("returns empty array when no result blocks are present", () => {
    expect(parseCitations("No results here.")).toEqual([]);
  });
});
