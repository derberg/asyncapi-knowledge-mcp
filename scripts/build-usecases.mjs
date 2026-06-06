#!/usr/bin/env node
// Build the AsyncAPI "use cases" knowledge source.
//
// The canonical data lives in asyncapi/website at config/usecases.yaml. That file
// maps each use case to a list of `$ref: '#/data/<key>'` pointers into a shared
// `data:` catalog of real-world company case studies. This script fetches that
// YAML, dereferences the pointers, and emits a single markdown document under
// .opencrane/sources/asyncapi-usecases/ so OpenCrane can index it like any other
// source. The weekly refresh re-runs this before `opencrane fetch`.
//
// Importable: buildUsecasesMarkdown() is pure (yaml string -> markdown) so it can
// be unit-tested without the network. The fetch + write only runs as a CLI.
import { writeFile, mkdir } from "node:fs/promises";
import { parse } from "yaml";

export const USECASES_URL =
  "https://raw.githubusercontent.com/asyncapi/website/refs/heads/master/config/usecases.yaml";

// Companies present in the `data:` catalog but not referenced by any use case
// upstream. Assigned here by hand so they remain discoverable under the right
// topic. Schwarz is intentionally absent — it is a commented-out TODO upstream.
export const EXTRA_ASSIGNMENTS = {
  infraascode: ["morgan"],
  docs: ["siemens", "pagopa"],
};

const REF_PREFIX = "#/data/";

// Resolve one `inproduction` entry (a `{ $ref }` object) to its data key.
function refToKey(entry) {
  const ref = entry && entry.$ref;
  if (typeof ref !== "string" || !ref.startsWith(REF_PREFIX)) {
    throw new Error(`Unexpected inproduction entry, expected a #/data/* $ref: ${JSON.stringify(entry)}`);
  }
  return ref.slice(REF_PREFIX.length);
}

// Render a single resolved company entry as a markdown list item.
function renderCompany(key, data) {
  const entry = data[key];
  if (!entry) throw new Error(`use case references missing data key: ${key}`);
  const links = (entry.resources ?? [])
    .map((r) => `[${r.type}](${r.url})`)
    .join(" · ");
  const suffix = links ? ` (${links})` : "";
  return `- **${entry.name}** — ${entry.description}${suffix}`;
}

/**
 * Convert the raw usecases.yaml text into a single markdown document.
 * @param {string} yamlText raw contents of config/usecases.yaml
 * @param {Record<string,string[]>} [extra] orphan-key assignments (defaults to EXTRA_ASSIGNMENTS)
 * @returns {string} markdown
 */
export function buildUsecasesMarkdown(yamlText, extra = EXTRA_ASSIGNMENTS) {
  const doc = parse(yamlText);
  const data = doc.data ?? {};
  const usecases = doc.usecases ?? {};

  const out = ["# AsyncAPI Use Cases", ""];
  if (doc.description) out.push(doc.description, "");
  out.push(
    "Real-world ways teams use AsyncAPI in production, grouped by use case. " +
      "Mirrored from [`asyncapi/website/config/usecases.yaml`](https://github.com/asyncapi/website/blob/master/config/usecases.yaml) " +
      "by the weekly refresh.",
    ""
  );

  for (const [id, uc] of Object.entries(usecases)) {
    // Upstream refs first, then any hand-assigned orphans, deduped (refs win order).
    const keys = (uc.inproduction ?? []).map(refToKey);
    for (const k of extra[id] ?? []) if (!keys.includes(k)) keys.push(k);

    out.push(`## ${uc.title}`, "");
    if (uc.description) out.push(uc.description, "");
    if (keys.length) {
      out.push("In production:", "");
      for (const key of keys) out.push(renderCompany(key, data));
      out.push("");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// --- CLI: fetch + write -----------------------------------------------------
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const res = await fetch(USECASES_URL);
  if (!res.ok) {
    console.error(`Failed to fetch usecases.yaml: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const markdown = buildUsecasesMarkdown(await res.text());
  const dir = new URL("../.opencrane/sources/asyncapi-usecases/", import.meta.url);
  await mkdir(dir, { recursive: true });
  const out = new URL("usecases.md", dir);
  await writeFile(out, markdown);
  console.log(`Wrote .opencrane/sources/asyncapi-usecases/usecases.md (${markdown.length} bytes)`);
}
