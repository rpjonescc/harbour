import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// lib/explain may import values only from itself, lib/scan/labels.ts and
// lib/scan/scoring/sub-score.ts (plus zod, for validating note frontmatter), so client
// components never bundle the database layer.
const ALLOWED = [
  // Only voice/note.ts uses it. A client component that imports a value from there would bundle
  // zod, so those imports stay `import type`.
  /^zod$/,
  /^\.\.?\//,
  /^@\/lib\/explain\//,
  /^@\/lib\/scan\/labels$/,
  /^@\/lib\/scan\/scoring\/sub-score$/,
];
const IMPORT = /^import\s+(?!type\b)(?:[^"']*?\sfrom\s+)?["']([^"']+)["']/gm;

function isSource(name: string): boolean {
  return name.endsWith(".ts") && !name.endsWith(".test.ts");
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return files(join(dir, e.name));
    return isSource(e.name) ? [join(dir, e.name)] : [];
  });
}

describe("lib/explain imports", () => {
  it("takes only types from outside its allowed modules", () => {
    const bad = files("lib/explain").flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(IMPORT)]
        .map((m) => m[1] ?? "")
        .filter((path) => !ALLOWED.some((ok) => ok.test(path)))
        .map((path) => `${file}: ${path}`),
    );
    expect(bad).toEqual([]);
  });
});
