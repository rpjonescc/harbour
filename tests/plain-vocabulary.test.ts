import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The on-screen source files: what a person reads is built from the strings in them. Stored
// values ("scan" as a job kind or an actor), API paths and comments are allowed; the e2e smoke
// check (tests/e2e/plain-language.ts) covers what the pages really render.
const ROOTS = [
  "components",
  "app/(app)",
  "lib/explain",
  "lib/settings",
  "lib/note",
  "lib/today",
  "lib/agents/view.ts",
  "lib/analyst/panel-view.ts",
  "lib/actions/rule-sync.ts",
  "lib/ops/backup-job.ts",
];
const WORD = /\bscan(?:s|ned|ning)?\b/i;
const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const JSX_TEXT = />[^<>{}\n]*\bscan(?:s|ned|ning)?\b[^<>{}\n]*</i;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
// Module paths ("@/lib/scan/views") and stored evidence text in the design examples are not prose.
const NOT_PROSE = /^\s*(?:import\b|\} from\b)|^\s*evidence:/;

function sourcesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A stored value, id or API path, not words a person reads: no spaces, or the API route. */
const allowed = (text: string) => /^[\w./-]+$/.test(text) || text.includes("/api/scans");

function offences(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (COMMENT.test(line) || NOT_PROSE.test(line)) return [];
      const literals = [...line.matchAll(LITERAL)].map((m) =>
        m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ""),
      );
      const bad = literals.some((text) => WORD.test(text) && !allowed(text));
      return bad || JSX_TEXT.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [];
    });
}

describe("plain vocabulary", () => {
  it("never says scan in a string the owner reads: the word is check", () => {
    const found = ROOTS.flatMap(sourcesUnder).flatMap(offences);
    expect(found).toEqual([]);
  });

  it("recognises a violation and lets stored values through", () => {
    expect(offences("components/ui/Button.tsx")).toEqual([]);
    expect(WORD.test("Last scan 1 Oct")).toBe(true);
    expect(JSX_TEXT.test("<p>Scan now</p>")).toBe(true);
    expect(allowed("scan")).toBe(true);
    expect(allowed("/api/scans")).toBe(true);
  });
});
