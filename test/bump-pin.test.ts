import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// @ts-expect-error -- plain .mjs script without type declarations
import { bump, PINNED_FILES } from "../scripts/bump-package-pin.mjs";

const ROOT = resolve(__dirname, "..");

describe("bump-package-pin", () => {
  it("dry-run finds exactly the expected pins in every file (drift guard)", async () => {
    // Fails when a pin is added/removed anywhere without updating PINNED_FILES —
    // which is exactly the failure mode that causes silent partial bumps.
    const { report, dryRun } = await bump("9.9.9", { dryRun: true });
    expect(dryRun).toBe(true);
    expect(report).toHaveLength(PINNED_FILES.length);
    for (const r of report) {
      expect(r.changed).toBe(true); // 9.9.9 differs from any real pin
      expect(r.from).toMatch(/^\d/);
    }
  });

  it("dry-run writes nothing", async () => {
    const before = await Promise.all(
      PINNED_FILES.map((f: { path: string }) => readFile(resolve(ROOT, f.path), "utf8"))
    );
    await bump("9.9.9", { dryRun: true });
    const after = await Promise.all(
      PINNED_FILES.map((f: { path: string }) => readFile(resolve(ROOT, f.path), "utf8"))
    );
    expect(after).toEqual(before);
  });

  it("all files pin the SAME version (no drift between locations)", async () => {
    const versions = new Set<string>();
    for (const f of PINNED_FILES as { path: string }[]) {
      const text = await readFile(resolve(ROOT, f.path), "utf8");
      for (const m of text.matchAll(/asyncapi-knowledge-mcp==([0-9][A-Za-z0-9.+!-]*)/g)) {
        versions.add(m[1]);
      }
    }
    expect([...versions]).toHaveLength(1);
  });

  it("rejects a version string that is not a version", async () => {
    await expect(bump("latest", { dryRun: true })).rejects.toThrow(/does not look like/);
    await expect(bump("; rm -rf /", { dryRun: true })).rejects.toThrow(/does not look like/);
  });
});
