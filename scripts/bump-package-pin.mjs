#!/usr/bin/env node
/**
 * Bump the pinned `asyncapi-knowledge-mcp==X.Y.Z` version everywhere it appears.
 *
 * Pinning policy: examples and deployments NEVER use an implicit "latest"
 * (supply-chain risk) — so every release must bump the pin in all locations.
 * This script is that bump. It is run automatically by publish-pypi.yml after
 * a release is published, and can be run by hand:
 *
 *   node scripts/bump-package-pin.mjs 0.0.3            # bump to 0.0.3
 *   node scripts/bump-package-pin.mjs 0.0.3 --dry-run  # report, write nothing
 *
 * Exits non-zero if any file does not contain EXACTLY the expected number of
 * pins — that means a pin location was added or removed without updating
 * PINNED_FILES below, and silent partial bumps are worse than failing.
 *
 * Also bumps the Claude plugin patch version + prepends a CHANGELOG entry,
 * since the plugin's .mcp.json content changes with the pin.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGE = "asyncapi-knowledge-mcp";
const PIN_RE = new RegExp(`${PACKAGE}==([0-9][A-Za-z0-9.+!-]*)`, "g");

// Every file that pins the package, with the exact number of pins expected.
export const PINNED_FILES = [
  { path: "chat/index.html", expected: 2 }, // .mcp.json snippet + claude mcp add
  { path: "README.md", expected: 2 }, // claude mcp add + client config
  { path: "plugins/asyncapi-knowledge/.mcp.json", expected: 1 },
  { path: "space/Dockerfile", expected: 1 },
];

const PLUGIN_JSON = "plugins/asyncapi-knowledge/.claude-plugin/plugin.json";
const PLUGIN_CHANGELOG = "plugins/asyncapi-knowledge/CHANGELOG.md";

async function pypiVersionExists(version) {
  const res = await fetch(`https://pypi.org/pypi/${PACKAGE}/${version}/json`);
  return res.ok;
}

export async function bump(version, { dryRun = false, skipPypiCheck = false } = {}) {
  if (!/^[0-9][A-Za-z0-9.+!-]*$/.test(version)) {
    throw new Error(`"${version}" does not look like a package version`);
  }
  // Dry runs never touch the network — they must work offline (CI tests).
  if (!skipPypiCheck && !dryRun && !(await pypiVersionExists(version))) {
    throw new Error(`${PACKAGE}==${version} is not on PyPI — publish first, then bump`);
  }

  const report = [];
  for (const { path, expected } of PINNED_FILES) {
    const abs = resolve(ROOT, path);
    const before = await readFile(abs, "utf8");
    const found = [...before.matchAll(PIN_RE)];
    if (found.length !== expected) {
      throw new Error(
        `${path}: found ${found.length} pin(s), expected ${expected}. ` +
          `Update PINNED_FILES in scripts/bump-package-pin.mjs.`
      );
    }
    const after = before.replace(PIN_RE, `${PACKAGE}==${version}`);
    const changed = after !== before;
    if (changed && !dryRun) await writeFile(abs, after);
    report.push({ path, pins: found.length, from: found[0]?.[1], changed });
  }

  // Plugin patch bump + changelog entry (its .mcp.json content changed).
  const pluginAbs = resolve(ROOT, PLUGIN_JSON);
  const plugin = JSON.parse(await readFile(pluginAbs, "utf8"));
  const [maj, min, pat] = plugin.version.split(".").map(Number);
  const pluginVersion = `${maj}.${min}.${pat + 1}`;
  const pinChanged = report.some((r) => r.changed);
  if (pinChanged && !dryRun) {
    plugin.version = pluginVersion;
    await writeFile(pluginAbs, JSON.stringify(plugin, null, 2) + "\n");
    const changelogAbs = resolve(ROOT, PLUGIN_CHANGELOG);
    const changelog = await readFile(changelogAbs, "utf8");
    const entry = `## ${pluginVersion}\n\n- Bump the bundled MCP package pin to \`${PACKAGE}==${version}\`.\n\n`;
    await writeFile(changelogAbs, changelog.replace(/^# Changelog\n\n/, `# Changelog\n\n${entry}`));
  }

  return { report, pluginVersion: pinChanged ? pluginVersion : plugin.version, dryRun };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipPypiCheck = args.includes("--skip-pypi-check");
  const version = args.find((a) => !a.startsWith("--"));
  if (!version) {
    console.error("usage: node scripts/bump-package-pin.mjs <version> [--dry-run]");
    process.exit(2);
  }
  try {
    const { report, pluginVersion } = await bump(version, { dryRun, skipPypiCheck });
    for (const r of report) {
      console.log(
        `${r.changed ? (dryRun ? "would bump" : "bumped") : "already at target"}: ${r.path} ` +
          `(${r.pins} pin(s), ${r.from} -> ${version})`
      );
    }
    console.log(`plugin version: ${pluginVersion}${dryRun ? " (dry-run, unchanged)" : ""}`);
  } catch (err) {
    console.error(`bump-package-pin: ${err.message}`);
    process.exit(1);
  }
}
