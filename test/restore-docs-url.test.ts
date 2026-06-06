import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// @ts-expect-error -- plain .mjs script without type declarations
import { restoreDocsUrls, DOCS_URLS } from "../scripts/restore-docs-url.mjs";

const ROOT = resolve(__dirname, "..");

// config.yaml exactly as `opencrane fetch` leaves it: docs_url stripped from the
// fetched asyncapi-website source, but kept on the local sources.
const STRIPPED = `ignore_patterns:
- devel
sources:
  asyncapi-website:
    url: https://github.com/asyncapi/website
    docs_path: markdown/docs
    manual: true
  asyncapi-json-schema:
    manual: true
    docs_url: https://github.com/asyncapi/website/blob/master/config/3.1.0.json
  asyncapi-usecases:
    manual: true
    docs_url: https://www.asyncapi.com/casestudies
`;

describe("restore-docs-url", () => {
  it("re-applies the stripped docs_url onto asyncapi-website", () => {
    const { changed, yaml } = restoreDocsUrls(STRIPPED);
    expect(changed).toBe(true);
    expect(yaml).toContain("docs_url: https://www.asyncapi.com/docs");
  });

  it("is idempotent — a second pass changes nothing", () => {
    const once = restoreDocsUrls(STRIPPED).yaml;
    const twice = restoreDocsUrls(once);
    expect(twice.changed).toBe(false);
    expect(twice.yaml).toBe(once);
  });

  it("leaves the local sources' docs_url untouched", () => {
    const { yaml } = restoreDocsUrls(STRIPPED);
    expect(yaml).toContain("https://www.asyncapi.com/casestudies");
    expect(yaml).toContain("https://github.com/asyncapi/website/blob/master/config/3.1.0.json");
  });

  it("throws if the target source is missing (drift guard)", () => {
    const noWebsite = STRIPPED.replace(/  asyncapi-website:[\s\S]*?manual: true\n/, "");
    expect(() => restoreDocsUrls(noWebsite)).toThrow(/asyncapi-website/);
  });

  it("the committed config.yaml already carries the docs_url it would restore", async () => {
    // Guards against re-introducing the stripped-config bug on main.
    const live = await readFile(resolve(ROOT, ".opencrane/config.yaml"), "utf8");
    const { changed } = restoreDocsUrls(live);
    expect(changed).toBe(false);
    for (const url of Object.values(DOCS_URLS)) expect(live).toContain(url);
  });
});
