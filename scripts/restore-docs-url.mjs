#!/usr/bin/env node
// `opencrane fetch` rewrites .opencrane/config.yaml ("Saved source mapping") and
// DROPS `docs_url` from fetched sources. Without it, `opencrane llms` builds
// links from the GitHub repo URL on branch `main` — but asyncapi/website lives on
// `master`, so every website link 404s and loses the nice asyncapi.com form.
//
// Re-apply the intended docs_url after every fetch (and before llms). Idempotent.
import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";

export const CONFIG_PATH = new URL("../.opencrane/config.yaml", import.meta.url);

// Fetched sources whose docs_url fetch strips, and the value to restore.
export const DOCS_URLS = {
  "asyncapi-website": "https://www.asyncapi.com/docs",
};

/**
 * Ensure each named source carries its intended docs_url.
 * @param {string} yamlText raw .opencrane/config.yaml
 * @param {Record<string,string>} [map] source name -> docs_url
 * @returns {{ changed: boolean, yaml: string }}
 */
export function restoreDocsUrls(yamlText, map = DOCS_URLS) {
  const doc = parse(yamlText);
  let changed = false;
  for (const [name, url] of Object.entries(map)) {
    const src = doc?.sources?.[name];
    if (!src) {
      throw new Error(`config.yaml has no source "${name}" to restore docs_url on`);
    }
    if (src.docs_url !== url) {
      src.docs_url = url;
      changed = true;
    }
  }
  return { changed, yaml: stringify(doc) };
}

// --- CLI --------------------------------------------------------------------
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const text = await readFile(CONFIG_PATH, "utf8");
  const { changed, yaml } = restoreDocsUrls(text);
  if (changed) {
    await writeFile(CONFIG_PATH, yaml);
    console.log(`Restored docs_url in .opencrane/config.yaml: ${Object.keys(DOCS_URLS).join(", ")}`);
  } else {
    console.log("docs_url already present — nothing to restore.");
  }
}
