import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  "lib/ops/retention.ts",
];
const WORD = /\b(?:re)?scan(?:s|ned|ning|ner|ners)?\b/i;
const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
// Text between a tag or an expression and the next one: <p>a {x} b</p> reads "a" and "b".
// Between `}` and `{` the pattern also reads plain TypeScript; assignments, calls and logic are code.
const CODE_LIKE = /[=;()]|&&|\|\|/;
const JSX_TEXT = /(?<=[>}])([^<>{}]*)(?=[<{])/g;
// Module paths ("@/lib/scan/views") are not prose, and neither are comments.
const MODULE_PATH = /\bfrom\s+["'][^"']*["']|\bimport\s*\(?\s*["'][^"']*["']/g;
const COMMENT = /\/\*[\s\S]*?\*\/|(?<![:"'`\\])\/\/.*$/gm;
// A line carrying this marker is a deliberate stored or CLI-only "scan" (say why beside it).
const MARKER = "vocabulary-ok";

function sourcesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * A stored value or identifier, not words a person reads: the lowercase job kind and actor
 * "scan", an API route or file path (has a "/" or "."), or a "scan-…" id. "Scan", "Scans",
 * "scanning" and "scanned" are all prose.
 */
const allowed = (text: string) =>
  text === "scan" || /^\/?[\w-]+(?:[./][\w-]+)+$/.test(text) || /^scan-[a-z-]+$/.test(text);

/** `plural(n, "scan")` builds a word the owner reads, so the bare literal is not a stored value. */
const pluralised = (before: string) => /\bplural\((?:[^()]|\([^()]*\))*,\s*$/.test(before);

const blank = (text: string) => text.replace(/[^\n]/g, " ");

/** Source with comments and module paths blanked out (newlines kept, so line numbers hold). */
function prose(source: string): string {
  return source.replace(COMMENT, blank).replace(MODULE_PATH, blank);
}

type Piece = { index: number; text: string; before: string };

/** The string literals in `code` (offset by `base`), including those inside `${…}` of a template. */
function literalsIn(code: string, base: number, whole: string): Piece[] {
  return [...code.matchAll(LITERAL)].flatMap((m) => {
    const at = base + m.index;
    const inner = [...m[0].matchAll(/\$\{([^}]*)\}/g)].flatMap((e) =>
      literalsIn(e[1] ?? "", at + e.index + 2, whole),
    );
    const text = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, "");
    return [{ index: at, text, before: whole.slice(0, at) }, ...inner];
  });
}

/** Every piece of text in the source a person might read: string literals and JSX text. */
function texts(source: string): Piece[] {
  const code = prose(source);
  const jsx = [...code.matchAll(JSX_TEXT)]
    .map((m) => ({
      index: m.index,
      text: m[1] ?? "",
      before: "",
    }))
    .filter((piece) => !CODE_LIKE.test(piece.text));
  return [...literalsIn(code, 0, code), ...jsx];
}

function offences(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  return texts(source).flatMap(({ index, text, before }) => {
    const bad = WORD.test(text) && (!allowed(text) || pluralised(before));
    const line = source.slice(0, index).split("\n").length;
    const stored = /\bevidence:\s*$/.test(before);
    if (!bad || stored || lines[line - 1]?.includes(MARKER)) return [];
    return [`${file}:${line}: ${lines[line - 1]?.trim()}`];
  });
}

function offencesIn(code: string): string[] {
  const file = join(mkdtempSync(join(tmpdir(), "vocab-")), "probe.tsx");
  writeFileSync(file, code);
  return offences(file);
}

describe("plain vocabulary", () => {
  it("never says scan in a string the owner reads: the word is check", () => {
    const found = ROOTS.flatMap(sourcesUnder).flatMap(offences);
    expect(found).toEqual([]);
  });

  it("flags a wrapped JSX sentence, a one-word label, a plural call and a multi-line template", () => {
    expect(offencesIn("const a = <p>\n  The next scan\n  tries again.\n</p>;")).toHaveLength(1);
    for (const word of ["Scan", "Scans", "scanning", "scanned"]) {
      expect(offencesIn(`const label = "${word}";`)).toHaveLength(1);
    }
    expect(offencesIn('const t = `${n} ${plural(n, "scan")}`;')).toHaveLength(1);
    expect(offencesIn("const t = `first line\nsecond ${x} scan`;")).toHaveLength(1);
  });

  it("reads JSX text that touches an expression, and the near-miss words", () => {
    expect(offencesIn("const a = <p>Next scan: {when}</p>;")).toHaveLength(1);
    expect(offencesIn("const a = <p>{n} scan results</p>;")).toHaveLength(1);
    expect(offencesIn("const a = <p>{a} then scan {b}</p>;")).toHaveLength(1);
    expect(offencesIn("const a = <p>{a} fine {b}</p>;")).toEqual([]);
    for (const word of ["Scanning...", "Scan.", "Scans/", "rescan", "Rescanned", "scanner"]) {
      expect(offencesIn(`const label = "${word}";`)).toHaveLength(1);
    }
    expect(offencesIn('const t = plural(Math.max(1, n), "scan");')).toHaveLength(1);
  });

  it("lets stored values, paths, ids, comments, marked lines and evidence text through", () => {
    expect(offencesIn('const kind = "scan"; // a scan job\nconst r = "/api/scans";')).toEqual([]);
    expect(offencesIn('const id = "scan-errors"; import x from "@/lib/scan/views";')).toEqual([]);
    expect(offencesIn('const t = plural(n, "scan"); // vocabulary-ok: CLI line')).toEqual([]);
    expect(offencesIn('const e = { evidence: "Readiness failed in this scan" };')).toEqual([]);
  });
});
