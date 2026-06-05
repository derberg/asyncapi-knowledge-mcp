#!/usr/bin/env node
// Download the AsyncAPI meta-schema referenced by
// .opencrane/sources/asyncapi-json-schema/asyncapi-schema-index.md.
import { writeFile } from "node:fs/promises";

const SCHEMA_URL = "https://raw.githubusercontent.com/asyncapi/website/master/config/3.1.0.json";
const out = new URL("../.opencrane/sources/asyncapi-json-schema/3.1.0.json", import.meta.url);
const res = await fetch(SCHEMA_URL);
if (!res.ok) { console.error(`Failed: ${res.status} ${res.statusText}`); process.exit(1); }
const text = await res.text();
JSON.parse(text); // fail loudly on invalid JSON
await writeFile(out, text);
console.log(`Wrote .opencrane/sources/asyncapi-json-schema/3.1.0.json (${text.length} bytes)`);
