# Harbour Phase 2a (Viewer and Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read and search the Second Brain inside Harbour, install Harbour as an app, improve the Devices page, and enforce a private-data check before every commit and push.

**Architecture:** Pure brain modules in `lib/brain/` (path guard, tree, frontmatter, wiki-links, Markdown rendering, SQLite FTS5 indexer, search, view state) with tests; a server-only runtime singleton that indexes `HARBOUR_BRAIN_DIR` on first use and re-indexes on file changes (debounced, single-flight). Thin App Router pages under `app/(app)/brain/` render sanitised HTML; a client ⌘K dialog queries a session-guarded search route.

**Tech Stack:** Next.js 16.3, React 19.3, TypeScript 6 strict, Tailwind 4, Drizzle 0.45 + better-sqlite3 (FTS5), unified 11 / remark-parse 11 / remark-gfm 4 / remark-rehype 11 / rehype-sanitize 6 / rehype-slug 6 / rehype-stringify 10, yaml 2, zod 4, Vitest 5, Playwright 1.63, Biome 2.5.

**Spec:** `docs/superpowers/specs/2026-10-01-phase-2-second-brain-design.md` Part 2a (A1–A9). **Repo rules:** `AGENTS.md` (public repo hygiene, README, file sizes, semantic tokens).

## Global Constraints

- Public repo: never commit personal data — use fictional examples only (`example.com`, `owner@example.com`, "Acme Docs").
- Every page calls `requireSession()`; every API route checks `getSession()` (401 JSON `{ error: "unauthenticated" }` if missing); mutating routes also call `rejectCrossSite(request, getConfig().HARBOUR_ORIGIN)` first.
- Brain paths: only `.md` files inside `HARBOUR_BRAIN_DIR`; reject absolute paths, `..`, empty or hidden segments (leading `.`), NUL bytes, and symlink escapes (realpath outside root) — rendered as 404.
- Tree cap 5,000 files; one reindex at a time; watcher debounce 1,000 ms; search input capped at 200 chars and 8 tokens; search returns at most 20 hits.
- Rendered Markdown is sanitised (no scripts, event handlers, `style`, iframes); external images become links; external links get `target="_blank" rel="noopener noreferrer"`.
- Components use semantic tokens only; no hex colours in `app/` or `components/` (brand hex values live in `design/brand.ts`). Text sizes via the Tailwind rem scale.
- File size hard limits: `.tsx` 300, `.ts` 400, tests 600, `.css` 500 lines.
- Update `README.md` in the same task as any new setting, command or user-visible feature.
- Commit messages: conventional prefix; end with the attribution trailer your environment specifies. Never `--no-verify`. Never `pkill`/`killall`; stop only servers you started, by PID.
- Run `pnpm check` before each commit.

## File Structure

```
scripts/checks/private-data.ts (+ .test.ts)   secret + owner-term detection (pure)
scripts/check-private.ts                       CLI: files, and --commits for unpushed commits
.private-terms.example                         template; real .private-terms is gitignored
lib/brain/paths.ts (+test)                     resolveBrainPath, BrainPathError
lib/brain/tree.ts (+test)                      listTree, filePaths
lib/brain/frontmatter.ts (+test)               splitFrontmatter, Frontmatter
lib/brain/docs.ts (+test)                      readDoc, titleFor, checkBrainRoot
lib/brain/wikilinks.ts (+test)                 link index, resolve, extract, brainHref
lib/brain/remark-wikilinks.ts                  remark plugin
lib/brain/rehype-harbour.ts                    external links, images→links, outline
lib/brain/render.ts (+test)                    renderMarkdown, stripLeadingTitle
lib/brain/indexer.ts (+test)                   reindexAll (docs, FTS, links)
lib/brain/search.ts (+test)                    searchBrain, toMatchQuery, splitSnippet
lib/brain/views.ts (+test)                     markViewed, newDocPaths, backlinks, recentDocs
lib/brain/single-flight.ts (+test)             debounced, non-overlapping runner
lib/brain/runtime.ts                           server-only singleton: ensureBrain, requestReindex, brainNewCount
lib/brain/editor-url.ts (+test)                editorUrlFor
lib/brain/view-model.ts                        server-only loadDocView
lib/format/date.ts (+test, modify)             isoDateIn, formatDateTime
app/(app)/brain/layout.tsx, page.tsx, [...path]/page.tsx, prose.css
app/api/brain/search/route.ts, app/api/brain/reindex/route.ts
components/brain/BrainTree.tsx, DocArticle.tsx, DocMeta.tsx, ContextRail.tsx,
  BrainHeader.tsx, ReindexButton.tsx, BrainSetupNotice.tsx, RecentDocs.tsx,
  SearchDialog.tsx (+test), useBrainSearch.ts
design/brand.ts; app/manifest.ts; app/icon.tsx; app/apple-icon.tsx; app/icons/[variant]/route.tsx
tests/fixtures/brain/**                        fictional brain for E2E
```

---

### Task 1: Private-data check (`pnpm check:private`)

**Files:**
- Create: `scripts/checks/private-data.ts`, `scripts/checks/private-data.test.ts`, `scripts/check-private.ts`, `.private-terms.example`
- Modify: `package.json` (scripts), `lefthook.yml`, `.gitignore`, `README.md`

**Interfaces:**
- Consumes: `type SourceFile = { path: string; content: string }` from `scripts/checks/file-size.ts`.
- Produces: `parseTerms(text: string): string[]`, `findPrivateData(file: SourceFile, terms: string[]): PrivateFinding[]`, `type PrivateFinding = { path: string; line: number; label: string }`; script `pnpm check:private [--commits]`.

- [ ] **Step 1: Write the failing tests `scripts/checks/private-data.test.ts`**

Test inputs are assembled with `+` so this file itself never contains a real-looking secret.

```ts
import { findPrivateData, parseTerms } from "./private-data";

const file = (content: string, path = "lib/example.ts") => ({ path, content });

describe("parseTerms", () => {
  it("drops comments and blank lines and trims", () => {
    expect(parseTerms("# comment\n\n  Jane Example  \njane@example.org\n")).toEqual([
      "Jane Example",
      "jane@example.org",
    ]);
  });
});

describe("findPrivateData — secrets", () => {
  const cases: [string, string][] = [
    ["private key", "-----BEGIN " + "OPENSSH PRIVATE KEY-----"],
    ["AWS access key", "key = AKIA" + "ABCDEFGHIJKLMNOP"],
    ["GitHub token", "token: ghp_" + "a".repeat(36)],
    ["Anthropic key", "sk-ant-" + "api03-" + "b".repeat(30)],
    ["OpenAI-style key", "sk-proj-" + "c".repeat(40)],
    ["Google API key", "AIza" + "d".repeat(35)],
    ["Slack token", "xoxb-" + "1234567890-abc"],
    ["real tailnet hostname", "https://pc.tail" + "abc123.ts.net"],
    ["home directory path", "/ho" + "me/alex/project/file"],
  ];
  it.each(cases)("detects a %s", (label, content) => {
    expect(findPrivateData(file(content), []).map((f) => f.label)).toEqual([label]);
  });

  it("ignores fictional examples used in docs", () => {
    const content = "https://pc.tail1234.ts.net and <machine>.<tailnet>.ts.net and owner@example.com";
    expect(findPrivateData(file(content), [])).toEqual([]);
  });
});

describe("findPrivateData — owner terms", () => {
  it("matches whole words case-insensitively and reports the line", () => {
    const findings = findPrivateData(file("first line\nWelcome to ACME widgets"), ["Acme"]);
    expect(findings).toEqual([{ path: "lib/example.ts", line: 2, label: 'term "Acme"' }]);
  });

  it("does not match inside longer words", () => {
    expect(findPrivateData(file("pretend to extend"), ["tend"])).toEqual([]);
  });

  it("matches terms containing punctuation such as emails", () => {
    expect(findPrivateData(file("mail jane@example.org now"), ["jane@example.org"])).toHaveLength(1);
  });

  it("skips generated files", () => {
    expect(findPrivateData(file("Acme", "pnpm-lock.yaml"), ["Acme"])).toEqual([]);
    expect(findPrivateData(file("Acme", "drizzle/meta/_journal.json"), ["Acme"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/checks/private-data.test.ts`
Expected: FAIL — cannot resolve `./private-data`.

- [ ] **Step 3: Implement `scripts/checks/private-data.ts`**

```ts
import type { SourceFile } from "./file-size";

export type PrivateFinding = { path: string; line: number; label: string };

const SECRET_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { label: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: "OpenAI-style key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}/ },
  { label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  // Real tailnet names have 6+ hex characters; docs use fictional ones like tail1234.
  { label: "real tailnet hostname", pattern: /\b[a-z0-9-]+\.tail[0-9a-f]{6,}\.ts\.net\b/i },
  { label: "home directory path", pattern: /(?:\/home\/|\/Users\/)[A-Za-z][\w.-]*\// },
];

const SKIPPED = [/^pnpm-lock\.yaml$/, /^drizzle\/meta\//];

/** Owner terms file: one term per line; `#` comments and blank lines ignored. */
export function parseTerms(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function termPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
}

/** Secrets and owner terms in one file, at most one finding per line. */
export function findPrivateData(file: SourceFile, terms: string[]): PrivateFinding[] {
  if (SKIPPED.some((pattern) => pattern.test(file.path))) return [];
  const termPatterns = terms.map((term) => ({ label: `term "${term}"`, pattern: termPattern(term) }));
  const patterns = [...SECRET_PATTERNS, ...termPatterns];
  const findings: PrivateFinding[] = [];
  file.content.split("\n").forEach((text, index) => {
    const hit = patterns.find(({ pattern }) => pattern.test(text));
    if (hit) findings.push({ path: file.path, line: index + 1, label: hit.label });
  });
  return findings;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run scripts/checks/private-data.test.ts`
Expected: PASS (all cases). If "sk-ant-…" is reported as "OpenAI-style key", the Anthropic pattern must stay above it in the list.

- [ ] **Step 5: Write the CLI `scripts/check-private.ts`**

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { findPrivateData, type PrivateFinding, parseTerms } from "./checks/private-data";

const TERMS_FILE = ".private-terms";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function hasRef(ref: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

function scanFiles(terms: string[]): PrivateFinding[] {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter((path) => path.length > 0 && existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, "utf8") }))
    .filter((file) => !file.content.includes("\0"))
    .flatMap((file) => findPrivateData(file, terms));
}

function scanUnpushedCommits(terms: string[]): PrivateFinding[] {
  const range = hasRef("origin/main") ? "origin/main..HEAD" : "HEAD";
  return git(["log", "--format=%h%x00%an <%ae>%n%B%x1e", range])
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      const [sha = "?", content = ""] = entry.split("\0");
      return findPrivateData({ path: `commit ${sha}`, content }, terms);
    });
}

const terms = existsSync(TERMS_FILE) ? parseTerms(readFileSync(TERMS_FILE, "utf8")) : [];
if (terms.length === 0) {
  console.warn(`note: no ${TERMS_FILE} — only secret patterns are checked (see .private-terms.example)`);
}
const findings = [
  ...scanFiles(terms),
  ...(process.argv.includes("--commits") ? scanUnpushedCommits(terms) : []),
];
for (const f of findings) console.error(`error ${f.path}:${f.line}: ${f.label} — remove before committing`);
if (findings.length > 0) process.exit(1);
console.log(`private data ok (${terms.length} owner terms checked)`);
```

- [ ] **Step 6: Wire up scripts, hooks, ignore file and template**

`package.json` scripts — add `check:private` and include it in `check`:
```json
"check:private": "tsx scripts/check-private.ts",
"check": "pnpm typecheck && pnpm lint && pnpm check:files && pnpm check:private && pnpm test",
```

`lefthook.yml` (full file):
```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,mts,mjs,js,json,css}"
      run: pnpm biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true
    files:
      run: pnpm check:files
    private:
      run: pnpm check:private
pre-push:
  commands:
    private:
      run: pnpm check:private --commits
    check:
      run: pnpm check
```

`.gitignore` — append:
```
.private-terms
```

`.private-terms.example`:
```
# Words that must never appear in this public repo: your name, emails, product and
# client names, hostnames. One per line, matched case-insensitively as whole words.
# Copy this file to .private-terms (gitignored) and replace these examples.
Jane Example
jane@example.org
Acme Widgets Pty Ltd
```

Run: `pnpm lefthook install`

- [ ] **Step 7: README**

In `README.md`, in the testing/quality section (after the line that lists `pnpm check`), add:
```markdown
`pnpm check:private` scans every tracked file for secrets (API keys, tokens, private
keys), real tailnet hostnames and home-directory paths, plus any words you list in a
gitignored `.private-terms` file (copy `.private-terms.example`). It runs on every commit,
and on every push it also checks unpushed commit messages and author details.
```

- [ ] **Step 8: Run the gate**

Run: `pnpm check:private && pnpm check:private --commits && pnpm check`
Expected: `private data ok (0 owner terms checked)` (with the note), and `pnpm check` passes.

- [ ] **Step 9: Commit**

```bash
git add scripts package.json lefthook.yml .gitignore .private-terms.example README.md
git commit -m "feat: scan for secrets and owner terms before every commit and push"
```

---

### Task 2: Brain file access (path guard, tree, frontmatter, documents)

**Files:**
- Create: `lib/brain/paths.ts`, `lib/brain/paths.test.ts`, `lib/brain/tree.ts`, `lib/brain/tree.test.ts`, `lib/brain/frontmatter.ts`, `lib/brain/frontmatter.test.ts`, `lib/brain/docs.ts`, `lib/brain/docs.test.ts`, `tests/helpers/brain.ts`
- Modify: `package.json` (add `yaml`)

**Interfaces:**
- Produces:
  - `class BrainPathError extends Error`; `resolveBrainPath(root: string, relativePath: string): string` (absolute real path)
  - `type TreeNode = { kind: "dir"; name: string; path: string; children: TreeNode[] } | { kind: "file"; name: string; path: string }`; `TREE_LIMIT = 5000`; `listTree(root: string, limit?: number): { nodes: TreeNode[]; truncated: boolean }`; `filePaths(nodes: TreeNode[]): string[]`
  - `type Frontmatter = { title?: string; tags?: string[]; researched?: string; confidence?: "low" | "medium" | "high"; review_by?: string; sources?: string[] }`; `splitFrontmatter(text: string): { frontmatter: Frontmatter; body: string; frontmatterError: string | null }`
  - `type BrainDoc = { path: string; absolutePath: string; title: string; frontmatter: Frontmatter; frontmatterError: string | null; body: string; mtime: Date }`; `readDoc(root: string, path: string): BrainDoc`; `titleFor(path: string, frontmatter: Frontmatter, body: string): string`; `type BrainRootStatus = { ok: true } | { ok: false; reason: "missing" | "not-directory" | "unreadable" }`; `checkBrainRoot(root: string): BrainRootStatus`
  - test helper `makeBrain(files: Record<string, string>): { root: string; cleanup: () => void }`

- [ ] **Step 1: Install yaml**

Run: `pnpm add yaml@^2.9.1`

- [ ] **Step 2: Write the test helper `tests/helpers/brain.ts`**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Temporary brain directory with the given relative files; call cleanup() in afterEach. */
export function makeBrain(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "harbour-brain-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
```

- [ ] **Step 3: Write failing tests**

`lib/brain/paths.test.ts`:
```ts
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { BrainPathError, resolveBrainPath } from "./paths";

describe("resolveBrainPath", () => {
  let brain: ReturnType<typeof makeBrain>;
  beforeEach(() => {
    brain = makeBrain({ "research/geo/a.md": "# A", "notes.txt": "x", ".hidden/b.md": "# B" });
  });
  afterEach(() => brain.cleanup());

  it("resolves a markdown file inside the root", () => {
    expect(resolveBrainPath(brain.root, "research/geo/a.md")).toMatch(/research\/geo\/a\.md$/);
  });

  it.each([
    ["traversal", "../etc/passwd.md"],
    ["nested traversal", "research/../../x.md"],
    ["absolute", "/etc/passwd.md"],
    ["hidden segment", ".hidden/b.md"],
    ["empty segment", "research//a.md"],
    ["non-markdown", "notes.txt"],
    ["NUL byte", "a\0.md"],
    ["missing file", "research/nope.md"],
  ])("rejects %s", (_name, path) => {
    expect(() => resolveBrainPath(brain.root, path)).toThrow(BrainPathError);
  });

  it("rejects a symlink that escapes the root", () => {
    const outside = mkdtempSync(join(tmpdir(), "harbour-outside-"));
    writeFileSync(join(outside, "secret.md"), "# secret");
    symlinkSync(join(outside, "secret.md"), join(brain.root, "link.md"));
    try {
      expect(() => resolveBrainPath(brain.root, "link.md")).toThrow(BrainPathError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
```

`lib/brain/tree.test.ts`:
```ts
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { filePaths, listTree } from "./tree";

describe("listTree", () => {
  it("lists markdown files, folders first, skipping hidden entries, other files and empty folders", () => {
    const brain = makeBrain({
      "b.md": "",
      "a.md": "",
      "research/z.md": "",
      "research/seo/y.md": "",
      ".git/config.md": "",
      "inbox/.gitkeep": "",
      "image.png": "",
    });
    try {
      const { nodes, truncated } = listTree(brain.root);
      expect(truncated).toBe(false);
      expect(nodes.map((n) => n.name)).toEqual(["research", "a.md", "b.md"]);
      expect(filePaths(nodes)).toEqual(["research/seo/y.md", "research/z.md", "a.md", "b.md"]);
    } finally {
      brain.cleanup();
    }
  });

  it("skips symlinks", () => {
    const brain = makeBrain({ "a.md": "" });
    try {
      symlinkSync(join(brain.root, "a.md"), join(brain.root, "link.md"));
      expect(filePaths(listTree(brain.root).nodes)).toEqual(["a.md"]);
    } finally {
      brain.cleanup();
    }
  });

  it("stops at the limit and reports truncation", () => {
    const brain = makeBrain({ "a.md": "", "b.md": "", "c.md": "" });
    try {
      const { nodes, truncated } = listTree(brain.root, 2);
      expect(filePaths(nodes)).toHaveLength(2);
      expect(truncated).toBe(true);
    } finally {
      brain.cleanup();
    }
  });
});
```

`lib/brain/frontmatter.test.ts`:
```ts
import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("parses valid frontmatter and returns the body", () => {
    const text = [
      "---",
      "title: How AI engines pick sources",
      "tags: [geo]",
      "researched: 2026-10-01",
      "confidence: medium",
      "review_by: 2027-01-01",
      "sources: [https://example.com/a]",
      "---",
      "# Body",
    ].join("\n");
    expect(splitFrontmatter(text)).toEqual({
      frontmatter: {
        title: "How AI engines pick sources",
        tags: ["geo"],
        researched: "2026-10-01",
        confidence: "medium",
        review_by: "2027-01-01",
        sources: ["https://example.com/a"],
      },
      body: "# Body",
      frontmatterError: null,
    });
  });

  it("returns the whole text as body when there is no frontmatter", () => {
    expect(splitFrontmatter("# Just text")).toEqual({
      frontmatter: {},
      body: "# Just text",
      frontmatterError: null,
    });
  });

  it("reports invalid values without hiding the body", () => {
    const result = splitFrontmatter("---\nconfidence: certain\n---\nBody");
    expect(result.body).toBe("Body");
    expect(result.frontmatter).toEqual({});
    expect(result.frontmatterError).toMatch(/confidence/);
  });

  it("reports broken YAML without hiding the body", () => {
    const result = splitFrontmatter("---\ntags: [unclosed\n---\nBody");
    expect(result.body).toBe("Body");
    expect(result.frontmatterError).toMatch(/YAML/);
  });
});
```

`lib/brain/docs.test.ts`:
```ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { checkBrainRoot, readDoc, titleFor } from "./docs";

describe("titleFor", () => {
  it("prefers frontmatter title, then first heading, then file name", () => {
    expect(titleFor("a/x.md", { title: "Front" }, "# Heading")).toBe("Front");
    expect(titleFor("a/x.md", {}, "intro\n# Heading\n")).toBe("Heading");
    expect(titleFor("a/glossary.md", {}, "no heading")).toBe("glossary");
  });
});

describe("readDoc", () => {
  it("reads a document with its parsed parts", () => {
    const brain = makeBrain({ "research/a.md": "---\ntags: [seo]\n---\n# Alpha\nText" });
    try {
      const doc = readDoc(brain.root, "research/a.md");
      expect(doc).toMatchObject({
        path: "research/a.md",
        title: "Alpha",
        frontmatter: { tags: ["seo"] },
        body: "# Alpha\nText",
        frontmatterError: null,
      });
      expect(doc.mtime).toBeInstanceOf(Date);
    } finally {
      brain.cleanup();
    }
  });
});

describe("checkBrainRoot", () => {
  it("distinguishes ok, missing and not-a-directory", () => {
    const brain = makeBrain({});
    try {
      writeFileSync(join(brain.root, "file"), "x");
      expect(checkBrainRoot(brain.root)).toEqual({ ok: true });
      expect(checkBrainRoot(join(brain.root, "nope"))).toEqual({ ok: false, reason: "missing" });
      expect(checkBrainRoot(join(brain.root, "file"))).toEqual({ ok: false, reason: "not-directory" });
    } finally {
      brain.cleanup();
    }
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm vitest run lib/brain`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement `lib/brain/paths.ts`**

```ts
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

/** A requested brain path that is invalid, missing, or outside the brain. Render as 404. */
export class BrainPathError extends Error {}

/** Resolves a brain-relative `.md` path to its real absolute path inside the brain root. */
export function resolveBrainPath(root: string, relativePath: string): string {
  if (relativePath.length === 0 || relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw new BrainPathError("invalid path");
  }
  const segments = relativePath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) {
    throw new BrainPathError("invalid path segment");
  }
  if (!relativePath.endsWith(".md")) throw new BrainPathError("only markdown documents");

  const rootReal = realpathSync(root);
  let fileReal: string;
  try {
    fileReal = realpathSync(join(rootReal, ...segments));
  } catch {
    throw new BrainPathError("not found");
  }
  const rel = relative(rootReal, fileReal);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new BrainPathError("outside the brain");
  }
  return fileReal;
}
```

- [ ] **Step 6: Implement `lib/brain/tree.ts`**

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";

export type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string };

export const TREE_LIMIT = 5000;

/** Markdown files and the folders that contain them. Hidden entries and symlinks are skipped. */
export function listTree(root: string, limit = TREE_LIMIT): { nodes: TreeNode[]; truncated: boolean } {
  let count = 0;
  let truncated = false;

  function walk(dir: string, prefix: string): TreeNode[] {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink())
      .sort(
        (a, b) =>
          Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
      );
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (count >= limit) {
        truncated = true;
        break;
      }
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const children = walk(join(dir, entry.name), path);
        if (children.length > 0) nodes.push({ kind: "dir", name: entry.name, path, children });
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count += 1;
        nodes.push({ kind: "file", name: entry.name, path });
      }
    }
    return nodes;
  }

  return { nodes: walk(root, ""), truncated };
}

/** All file paths in a tree, in tree order. */
export function filePaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : filePaths(node.children)));
}
```

- [ ] **Step 7: Implement `lib/brain/frontmatter.ts`**

```ts
import { parse } from "yaml";
import { z } from "zod";

const schema = z
  .object({
    title: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    researched: z.iso.date().optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
    review_by: z.iso.date().optional(),
    sources: z.array(z.url()).optional(),
  })
  .loose();

export type Frontmatter = {
  title?: string;
  tags?: string[];
  researched?: string;
  confidence?: "low" | "medium" | "high";
  review_by?: string;
  sources?: string[];
};

export type SplitDoc = { frontmatter: Frontmatter; body: string; frontmatterError: string | null };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Separates YAML frontmatter from the body. Problems are reported, never fatal. */
export function splitFrontmatter(text: string): SplitDoc {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatter: {}, body: text, frontmatterError: null };
  const body = text.slice(match[0].length);
  let raw: unknown;
  try {
    raw = parse(match[1] ?? "") ?? {};
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { frontmatter: {}, body, frontmatterError: `YAML: ${reason}` };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { frontmatter: {}, body, frontmatterError: z.prettifyError(result.error) };
  }
  const { title, tags, researched, confidence, review_by, sources } = result.data;
  return {
    frontmatter: Object.fromEntries(
      Object.entries({ title, tags, researched, confidence, review_by, sources }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Frontmatter,
    body,
    frontmatterError: null,
  };
}
```

- [ ] **Step 8: Implement `lib/brain/docs.ts`**

```ts
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { type Frontmatter, splitFrontmatter } from "./frontmatter";
import { resolveBrainPath } from "./paths";

export type BrainDoc = {
  path: string;
  absolutePath: string;
  title: string;
  frontmatter: Frontmatter;
  frontmatterError: string | null;
  body: string;
  mtime: Date;
};

/** Frontmatter title, else the first `# ` heading, else the file name. */
export function titleFor(path: string, frontmatter: Frontmatter, body: string): string {
  if (frontmatter.title) return frontmatter.title;
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return heading || basename(path, ".md");
}

/** Reads one document. Throws BrainPathError for invalid or outside paths. */
export function readDoc(root: string, path: string): BrainDoc {
  const absolutePath = resolveBrainPath(root, path);
  const parsed = splitFrontmatter(readFileSync(absolutePath, "utf8"));
  return {
    path,
    absolutePath,
    ...parsed,
    title: titleFor(path, parsed.frontmatter, parsed.body),
    mtime: statSync(absolutePath).mtime,
  };
}

export type BrainRootStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "not-directory" | "unreadable" };

/** Whether HARBOUR_BRAIN_DIR points at a usable directory. */
export function checkBrainRoot(root: string): BrainRootStatus {
  try {
    return statSync(root).isDirectory() ? { ok: true } : { ok: false, reason: "not-directory" };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    return { ok: false, reason: code === "ENOENT" ? "missing" : "unreadable" };
  }
}
```

- [ ] **Step 9: Run to verify pass**

Run: `pnpm vitest run lib/brain`
Expected: PASS.

- [ ] **Step 10: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add lib/brain tests/helpers/brain.ts package.json pnpm-lock.yaml
git commit -m "feat(brain): safe document access, tree listing and frontmatter parsing"
```

---

### Task 3: Markdown rendering with wiki-links

**Files:**
- Create: `lib/brain/wikilinks.ts`, `lib/brain/wikilinks.test.ts`, `lib/brain/remark-wikilinks.ts`, `lib/brain/rehype-harbour.ts`, `lib/brain/render.ts`, `lib/brain/render.test.ts`
- Modify: `package.json` (dependencies)

**Interfaces:**
- Produces:
  - `WIKI_LINK: RegExp`; `type LinkIndex = Map<string, string[]>`; `buildLinkIndex(paths: string[]): LinkIndex`; `resolveWikiLink(index: LinkIndex, name: string): { path: string; alternatives: string[] } | null`; `extractWikiTargets(body: string): string[]`; `brainHref(path: string): string`
  - `type OutlineItem = { id: string; text: string; depth: 2 | 3 }`; `type RenderedDoc = { html: string; outline: OutlineItem[]; links: string[] }`; `renderMarkdown(body: string, index: LinkIndex): Promise<RenderedDoc>`; `stripLeadingTitle(body: string, title: string): string`

- [ ] **Step 1: Install**

Run: `pnpm add unified@^11.0.5 remark-parse@^11.0.0 remark-gfm@^4.0.1 remark-rehype@^11.1.2 rehype-sanitize@^6.0.0 rehype-slug@^6.0.0 rehype-stringify@^10.0.1 unist-util-visit@^5.1.0 hast-util-to-string@^3.0.1 && pnpm add -D @types/mdast @types/hast`

- [ ] **Step 2: Write failing tests**

`lib/brain/wikilinks.test.ts`:
```ts
import { brainHref, buildLinkIndex, extractWikiTargets, resolveWikiLink } from "./wikilinks";

const index = buildLinkIndex([
  "research/glossary.md",
  "research/geo/how-ai-engines-pick-sources.md",
  "archive/old/glossary.md",
]);

describe("resolveWikiLink", () => {
  it("resolves by file name, case-insensitively", () => {
    expect(resolveWikiLink(index, "How-AI-Engines-Pick-Sources")).toEqual({
      path: "research/geo/how-ai-engines-pick-sources.md",
      alternatives: [],
    });
  });

  it("picks the shortest path for ambiguous names and lists the others", () => {
    expect(resolveWikiLink(index, "glossary")).toEqual({
      path: "research/glossary.md",
      alternatives: ["archive/old/glossary.md"],
    });
  });

  it("resolves path-style links", () => {
    expect(resolveWikiLink(index, "old/glossary")?.path).toBe("archive/old/glossary.md");
  });

  it("returns null when nothing matches", () => {
    expect(resolveWikiLink(index, "missing")).toBeNull();
  });
});

describe("extractWikiTargets", () => {
  it("finds plain and labelled links", () => {
    expect(extractWikiTargets("See [[glossary]] and [[geo/x|the GEO note]].")).toEqual([
      "glossary",
      "geo/x",
    ]);
  });
});

describe("brainHref", () => {
  it("encodes each segment", () => {
    expect(brainHref("research/a b.md")).toBe("/brain/research/a%20b.md");
  });
});
```

`lib/brain/render.test.ts`:
```ts
import { renderMarkdown, stripLeadingTitle } from "./render";
import { buildLinkIndex } from "./wikilinks";

const index = buildLinkIndex(["research/glossary.md"]);

describe("renderMarkdown", () => {
  it("strips scripts, event handlers, inline styles and iframes", async () => {
    const { html } = await renderMarkdown(
      [
        "<script>alert(1)</script>",
        '<p onclick="steal()" style="color:red">hi</p>',
        '<iframe src="https://example.com"></iframe>',
      ].join("\n\n"),
      index,
    );
    expect(html).not.toMatch(/<script|onclick|style=|<iframe/);
  });

  it("turns resolved wiki-links into brain links and reports them", async () => {
    const { html, links } = await renderMarkdown("See [[glossary|the glossary]].", index);
    expect(html).toContain('<a href="/brain/research/glossary.md" class="wikilink">the glossary</a>');
    expect(links).toEqual(["research/glossary.md"]);
  });

  it("keeps unresolved wiki-links visible as broken", async () => {
    const { html } = await renderMarkdown("See [[nowhere]].", index);
    expect(html).toMatch(/<span class="wikilink-broken" title="No document named “nowhere”">nowhere<\/span>/);
  });

  it("opens external links in a new tab safely", async () => {
    const { html } = await renderMarkdown("[site](https://example.com)", index);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("replaces images with links instead of loading them", async () => {
    const { html } = await renderMarkdown("![chart](https://example.com/c.png)", index);
    expect(html).not.toContain("<img");
    expect(html).toContain('<a href="https://example.com/c.png"');
    expect(html).toContain("Image: chart");
  });

  it("builds an outline from h2 and h3 with stable ids", async () => {
    const { html, outline } = await renderMarkdown("## Signals that matter\n\n### Mentions", index);
    expect(outline).toEqual([
      { id: "signals-that-matter", text: "Signals that matter", depth: 2 },
      { id: "mentions", text: "Mentions", depth: 3 },
    ]);
    expect(html).toContain('<h2 id="signals-that-matter">');
  });

  it("renders GitHub-flavoured tables", async () => {
    const { html } = await renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |", index);
    expect(html).toContain("<table>");
  });
});

describe("stripLeadingTitle", () => {
  it("removes a first heading that repeats the title", () => {
    expect(stripLeadingTitle("# Alpha\n\nText", "Alpha")).toBe("Text");
    expect(stripLeadingTitle("\n# Alpha\nText", "Alpha")).toBe("Text");
  });

  it("keeps the body when the heading differs", () => {
    expect(stripLeadingTitle("# Other\nText", "Alpha")).toBe("# Other\nText");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run lib/brain/wikilinks.test.ts lib/brain/render.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `lib/brain/wikilinks.ts`**

```ts
/** `[[target]]` or `[[target|label]]`. Create a new RegExp from `.source` before stateful use. */
export const WIKI_LINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

/** Lower-cased file name (no `.md`) → matching paths, shortest first. */
export type LinkIndex = Map<string, string[]>;

const keyFor = (name: string) => name.trim().toLowerCase().replace(/\.md$/, "");

export function buildLinkIndex(paths: string[]): LinkIndex {
  const index: LinkIndex = new Map();
  for (const path of paths) {
    const key = keyFor(path.split("/").pop() ?? path);
    index.set(key, [...(index.get(key) ?? []), path]);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.length - b.length || a.localeCompare(b));
  }
  return index;
}

/** Resolves a link name to a document; ambiguous names choose the shortest path. */
export function resolveWikiLink(
  index: LinkIndex,
  name: string,
): { path: string; alternatives: string[] } | null {
  const wanted = keyFor(name);
  if (wanted.includes("/")) {
    const match = [...index.values()]
      .flat()
      .find((p) => p.toLowerCase() === `${wanted}.md` || p.toLowerCase().endsWith(`/${wanted}.md`));
    return match ? { path: match, alternatives: [] } : null;
  }
  const [path, ...alternatives] = index.get(wanted) ?? [];
  return path ? { path, alternatives } : null;
}

/** Raw link targets in a body, in order. */
export function extractWikiTargets(body: string): string[] {
  return [...body.matchAll(new RegExp(WIKI_LINK.source, "g"))]
    .map((match) => match[1]?.trim() ?? "")
    .filter((target) => target.length > 0);
}

/** URL of a document in the viewer. */
export function brainHref(path: string): string {
  return `/brain/${path.split("/").map(encodeURIComponent).join("/")}`;
}
```

- [ ] **Step 5: Implement `lib/brain/remark-wikilinks.ts`**

```ts
import type { PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import { brainHref, type LinkIndex, resolveWikiLink, WIKI_LINK } from "./wikilinks";

type Options = { index: LinkIndex; onLink: (path: string) => void };

function toNodes(value: string, options: Options): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let last = 0;
  for (const match of value.matchAll(new RegExp(WIKI_LINK.source, "g"))) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", value: value.slice(last, start) });
    const target = match[1]?.trim() ?? "";
    const label = match[2]?.trim() || target;
    const resolved = resolveWikiLink(options.index, target);
    if (resolved) {
      options.onLink(resolved.path);
      parts.push({
        type: "link",
        url: brainHref(resolved.path),
        title: resolved.alternatives.length
          ? `Also matches: ${resolved.alternatives.join(", ")}`
          : null,
        children: [{ type: "text", value: label }],
        data: { hProperties: { className: ["wikilink"] } },
      });
    } else {
      parts.push({
        type: "emphasis",
        children: [{ type: "text", value: label }],
        data: {
          hName: "span",
          hProperties: { className: ["wikilink-broken"], title: `No document named “${target}”` },
        },
      });
    }
    last = start + match[0].length;
  }
  if (parts.length > 0 && last < value.length) parts.push({ type: "text", value: value.slice(last) });
  return parts;
}

/** Replaces `[[wiki-links]]` in text with links (resolved) or visibly broken spans. */
export function remarkWikiLinks(options: Options) {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const parts = toNodes(node.value, options);
      if (parts.length === 0) return;
      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}
```

- [ ] **Step 6: Implement `lib/brain/rehype-harbour.ts`**

```ts
import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import { visit } from "unist-util-visit";

export type OutlineItem = { id: string; text: string; depth: 2 | 3 };

const EXTERNAL = /^https?:\/\//i;
const NEW_TAB = { target: "_blank", rel: ["noopener", "noreferrer"] };

/** External links open safely, remote images become links, and h2/h3 feed the outline. */
export function rehypeHarbour(options: { outline: OutlineItem[] }) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const href = node.properties.href;
      if (node.tagName === "a" && typeof href === "string" && EXTERNAL.test(href)) {
        Object.assign(node.properties, NEW_TAB);
      }
      if (node.tagName === "img" && parent && index !== undefined) {
        const src = typeof node.properties.src === "string" ? node.properties.src : "";
        const alt = typeof node.properties.alt === "string" && node.properties.alt ? node.properties.alt : src;
        parent.children[index] = {
          type: "element",
          tagName: "a",
          properties: { href: src, ...NEW_TAB },
          children: [{ type: "text", value: `Image: ${alt}` }],
        };
      }
      const id = node.properties.id;
      if ((node.tagName === "h2" || node.tagName === "h3") && typeof id === "string") {
        options.outline.push({ id, text: textOf(node), depth: node.tagName === "h2" ? 2 : 3 });
      }
    });
  };
}
```

- [ ] **Step 7: Implement `lib/brain/render.ts`**

```ts
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { type OutlineItem, rehypeHarbour } from "./rehype-harbour";
import { remarkWikiLinks } from "./remark-wikilinks";
import type { LinkIndex } from "./wikilinks";

export type { OutlineItem };
export type RenderedDoc = { html: string; outline: OutlineItem[]; links: string[] };

// GitHub-style allowlist plus the two wiki-link classes and link titles.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ["className", "wikilink"], "title"],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "wikilink-broken"], "title"],
  },
};

/** Markdown → sanitised HTML, with outline and the brain documents it links to. */
export async function renderMarkdown(body: string, index: LinkIndex): Promise<RenderedDoc> {
  const outline: OutlineItem[] = [];
  const links = new Set<string>();
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks, { index, onLink: (path: string) => links.add(path) })
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeHarbour, { outline })
    .use(rehypeStringify)
    .process(body);
  return { html: String(file), outline, links: [...links] };
}

/** Drops a leading `# Title` that repeats the page title (the page already shows it). */
export function stripLeadingTitle(body: string, title: string): string {
  const match = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(body);
  if (!match || match[1] !== title) return body;
  return body.slice(match[0].length).replace(/^\s+/, "");
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm vitest run lib/brain`
Expected: PASS. If the broken-link assertion fails only on attribute order or quote style, adjust the assertion to check `class="wikilink-broken"`, the title text and the label separately — never weaken it to only "contains nowhere".

- [ ] **Step 9: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add lib/brain package.json pnpm-lock.yaml
git commit -m "feat(brain): sanitised markdown rendering with wiki-links and outline"
```

---

### Task 4: Search index, view state and runtime

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0002_brain_index.sql` (generated), `drizzle/0003_brain_fts.sql` (custom), `lib/brain/indexer.ts`, `lib/brain/indexer.test.ts`, `lib/brain/search.ts`, `lib/brain/search.test.ts`, `lib/brain/views.ts`, `lib/brain/views.test.ts`, `lib/brain/single-flight.ts`, `lib/brain/single-flight.test.ts`, `lib/brain/watch-filter.ts`, `lib/brain/watch-filter.test.ts`, `lib/brain/runtime.ts`

**Interfaces:**
- Consumes: Task 2 (`listTree`, `filePaths`, `splitFrontmatter`, `titleFor`, `checkBrainRoot`), Task 3 (`buildLinkIndex`, `resolveWikiLink`, `extractWikiTargets`), `getDb`, `getConfig`, `openTestDb`.
- Produces:
  - tables `brainDocs` (`path` PK, `title`, `mtime`, `contentHash`, `lastViewedAt`), `brainLinks` (`fromPath`, `toPath`, PK both), FTS5 `brain_fts(path UNINDEXED, title, body)`
  - `reindexAll(db: Db, root: string): { indexed: number; removed: number }`
  - `type SnippetPart = { text: string; hit: boolean }`; `type SearchHit = { path: string; title: string; snippet: SnippetPart[] }`; `toMatchQuery(input: string): string | null`; `splitSnippet(raw: string): SnippetPart[]`; `searchBrain(db: Db, input: string, limit?: number): SearchHit[]`
  - `markViewed(db, path, now?)`, `newDocPaths(db): Set<string>`, `backlinks(db, path): { path: string; title: string }[]`, `recentDocs(db, limit?): { path: string; title: string; mtime: Date }[]`
  - `createSingleFlight(task, onError, onSuccess?): { trigger(delayMs: number): boolean }`
  - `isIgnoredChange(filename: string | null): boolean`
  - runtime: `type BrainStatus = { available: true; root: string; watchError: string | null } | { available: false; root: string; reason: "missing" | "not-directory" | "unreadable" }`; `ensureBrain(): BrainStatus`; `requestReindex(): boolean`; `brainNewCount(): number | null`

- [ ] **Step 1: Add tables to `lib/db/schema.ts`**

Change the import line to `import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";` and append:

```ts
export const brainDocs = sqliteTable("brain_docs", {
  path: text("path").primaryKey(),
  title: text("title").notNull(),
  mtime: timestamp("mtime").notNull(),
  contentHash: text("content_hash").notNull(),
  lastViewedAt: timestamp("last_viewed_at"),
});

export const brainLinks = sqliteTable(
  "brain_links",
  {
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fromPath, table.toPath] })],
);
```

- [ ] **Step 2: Generate migrations**

Run: `pnpm db:generate --name brain_index`
Expected: `drizzle/0002_brain_index.sql` creating `brain_docs` and `brain_links`.

Run: `pnpm db:generate --custom --name brain_fts`
Then replace the generated `drizzle/0003_brain_fts.sql` content with:
```sql
CREATE VIRTUAL TABLE `brain_fts` USING fts5(path UNINDEXED, title, body, tokenize = 'porter unicode61');
```

- [ ] **Step 3: Write failing tests**

`lib/brain/single-flight.test.ts`:
```ts
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces bursts into one run", async () => {
    const task = vi.fn();
    const runner = createSingleFlight(task, vi.fn());
    runner.trigger(1000);
    runner.trigger(1000);
    runner.trigger(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never overlaps; a trigger during a run schedules exactly one follow-up", async () => {
    let release: () => void = () => {};
    const task = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const runner = createSingleFlight(task, vi.fn());
    runner.trigger(0);
    await vi.advanceTimersByTimeAsync(0);
    runner.trigger(0);
    runner.trigger(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("reports whether a trigger started fresh work", async () => {
    const runner = createSingleFlight(vi.fn(), vi.fn());
    expect(runner.trigger(0)).toBe(true);
    expect(runner.trigger(0)).toBe(false);
  });

  it("reports failures and success", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const failing = createSingleFlight(() => { throw new Error("boom"); }, onError, onSuccess);
    failing.trigger(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
```

`lib/brain/indexer.test.ts`:
```ts
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brainDocs, brainLinks } from "@/lib/db/schema";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { searchBrain } from "./search";

describe("reindexAll", () => {
  it("indexes documents, titles and links, and is incremental", () => {
    const brain = makeBrain({
      "research/glossary.md": "# Glossary\nAEO means answer engine optimisation.",
      "research/geo.md": "---\ntitle: GEO basics\n---\nSee [[glossary]] about Perplexity citations.",
    });
    const db = openTestDb();
    try {
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 2, removed: 0 });
      expect(db.select().from(brainDocs).all().map((d) => d.title).sort()).toEqual(["GEO basics", "Glossary"]);
      expect(db.select().from(brainLinks).all()).toEqual([
        { fromPath: "research/geo.md", toPath: "research/glossary.md" },
      ]);
      expect(searchBrain(db, "perplexity").map((h) => h.path)).toEqual(["research/geo.md"]);
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 0, removed: 0 });
    } finally {
      brain.cleanup();
    }
  });

  it("removes deleted documents from every table", () => {
    const brain = makeBrain({ "a.md": "# A\nalpha [[b]]", "b.md": "# B\nbravo" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      rmSync(join(brain.root, "b.md"));
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 0, removed: 1 });
      expect(searchBrain(db, "bravo")).toEqual([]);
      expect(db.select().from(brainLinks).all()).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("re-resolves links in unchanged documents when a target appears", () => {
    const brain = makeBrain({ "a.md": "links to [[later]]" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      expect(db.select().from(brainLinks).all()).toEqual([]);
      writeFileSync(join(brain.root, "later.md"), "# Later");
      reindexAll(db, brain.root);
      expect(db.select().from(brainLinks).all()).toEqual([{ fromPath: "a.md", toPath: "later.md" }]);
    } finally {
      brain.cleanup();
    }
  });
});
```

`lib/brain/search.test.ts`:
```ts
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { searchBrain, splitSnippet, toMatchQuery } from "./search";

describe("toMatchQuery", () => {
  it("keeps only words, quotes them and adds prefix matching", () => {
    expect(toMatchQuery('perplex "cit*" OR -x')).toBe('"perplex"* "cit"* "OR"* "x"*');
  });
  it("returns null for input with no words", () => {
    expect(toMatchQuery("  *** ")).toBeNull();
  });
  it("caps the number of tokens", () => {
    expect(toMatchQuery("a b c d e f g h i j")?.split(" ")).toHaveLength(8);
  });
});

describe("splitSnippet", () => {
  it("splits on highlight markers", () => {
    expect(splitSnippet("before \u0002hit\u0003 after")).toEqual([
      { text: "before ", hit: false },
      { text: "hit", hit: true },
      { text: " after", hit: false },
    ]);
  });
});

describe("searchBrain", () => {
  it("finds documents by prefix and highlights matches without trusting HTML", () => {
    const brain = makeBrain({ "a.md": "# Alpha\nPerplexity <b>cites</b> sources." });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      const [hit] = searchBrain(db, "perplex");
      expect(hit?.path).toBe("a.md");
      expect(hit?.title).toBe("Alpha");
      expect(hit?.snippet.some((part) => part.hit && /perplexity/i.test(part.text))).toBe(true);
      expect(hit?.snippet.map((p) => p.text).join("")).toContain("<b>cites</b>");
    } finally {
      brain.cleanup();
    }
  });
});
```

`lib/brain/watch-filter.test.ts`:
```ts
import { isIgnoredChange } from "./watch-filter";

describe("isIgnoredChange", () => {
  it("ignores git and hidden paths only", () => {
    expect(isIgnoredChange(".git/index")).toBe(true);
    expect(isIgnoredChange("research/.draft.md")).toBe(true);
    expect(isIgnoredChange("research/geo/a.md")).toBe(false);
    expect(isIgnoredChange(null)).toBe(false);
  });
});
```

`lib/brain/views.test.ts`:
```ts
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { backlinks, markViewed, newDocPaths, recentDocs } from "./views";

describe("view state", () => {
  it("treats never-viewed and changed-since-viewed documents as new", () => {
    const brain = makeBrain({ "a.md": "# A", "b.md": "# B links [[a]]" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      expect([...newDocPaths(db)].sort()).toEqual(["a.md", "b.md"]);
      markViewed(db, "a.md", new Date(Date.now() + 60_000));
      expect([...newDocPaths(db)]).toEqual(["b.md"]);
      // Titles come verbatim from the first heading when there is no frontmatter title.
      expect(backlinks(db, "a.md")).toEqual([{ path: "b.md", title: "B links [[a]]" }]);
      expect(recentDocs(db, 1)).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm vitest run lib/brain`
Expected: new suites FAIL (modules not found).

- [ ] **Step 5: Implement `lib/brain/single-flight.ts`**

```ts
/**
 * Debounced runner that never overlaps itself: triggers during a run schedule exactly one
 * follow-up run. `trigger` returns true when no run was pending or in progress.
 */
export function createSingleFlight(
  task: () => void | Promise<void>,
  onError: (error: unknown) => void,
  onSuccess?: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;

  function schedule(delayMs: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  }

  async function run() {
    timer = null;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await task();
      onSuccess?.();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule(0);
      }
    }
  }

  return {
    trigger(delayMs: number): boolean {
      const idle = !running && timer === null;
      schedule(delayMs);
      return idle;
    },
  };
}
```

- [ ] **Step 6: Implement `lib/brain/indexer.ts`**

```ts
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { brainDocs, brainLinks } from "@/lib/db/schema";
import { titleFor } from "./docs";
import { splitFrontmatter } from "./frontmatter";
import { filePaths, listTree } from "./tree";
import { buildLinkIndex, extractWikiTargets, type LinkIndex, resolveWikiLink } from "./wikilinks";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function replaceLinks(tx: Tx, path: string, body: string, linkIndex: LinkIndex) {
  tx.delete(brainLinks).where(eq(brainLinks.fromPath, path)).run();
  const targets = new Set(
    extractWikiTargets(body)
      .map((target) => resolveWikiLink(linkIndex, target)?.path)
      .filter((target): target is string => target !== undefined && target !== path),
  );
  for (const toPath of targets) {
    tx.insert(brainLinks).values({ fromPath: path, toPath }).onConflictDoNothing().run();
  }
}

/**
 * Brings brain_docs, brain_fts and brain_links in line with the files on disk.
 * Unchanged files (same content hash) are skipped, except that links are re-resolved
 * for every document when files were added or removed.
 */
export function reindexAll(db: Db, root: string): { indexed: number; removed: number } {
  const paths = filePaths(listTree(root).nodes);
  const present = new Set(paths);
  const linkIndex = buildLinkIndex(paths);
  const existing = new Map(
    db.select({ path: brainDocs.path, hash: brainDocs.contentHash }).from(brainDocs).all()
      .map((row) => [row.path, row.hash]),
  );
  const pathsChanged = paths.length !== existing.size || paths.some((p) => !existing.has(p));
  const gone = [...existing.keys()].filter((path) => !present.has(path));
  let indexed = 0;

  db.transaction((tx) => {
    for (const path of paths) {
      const absolute = join(root, path);
      const text = readFileSync(absolute, "utf8");
      const hash = createHash("sha256").update(text).digest("hex");
      const { frontmatter, body } = splitFrontmatter(text);
      if (existing.get(path) === hash) {
        if (pathsChanged) replaceLinks(tx, path, body, linkIndex);
        continue;
      }
      const title = titleFor(path, frontmatter, body);
      const mtime = statSync(absolute).mtime;
      tx.insert(brainDocs)
        .values({ path, title, mtime, contentHash: hash, lastViewedAt: null })
        .onConflictDoUpdate({ target: brainDocs.path, set: { title, mtime, contentHash: hash } })
        .run();
      tx.run(sql`DELETE FROM brain_fts WHERE path = ${path}`);
      tx.run(sql`INSERT INTO brain_fts (path, title, body) VALUES (${path}, ${title}, ${body})`);
      replaceLinks(tx, path, body, linkIndex);
      indexed += 1;
    }
    for (const path of gone) {
      tx.delete(brainDocs).where(eq(brainDocs.path, path)).run();
      tx.run(sql`DELETE FROM brain_fts WHERE path = ${path}`);
      tx.delete(brainLinks)
        .where(or(eq(brainLinks.fromPath, path), eq(brainLinks.toPath, path)))
        .run();
    }
  });

  return { indexed, removed: gone.length };
}
```

- [ ] **Step 7: Implement `lib/brain/search.ts`**

```ts
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";

export type SnippetPart = { text: string; hit: boolean };
export type SearchHit = { path: string; title: string; snippet: SnippetPart[] };

const START = "\u0002";
const END = "\u0003";
const MAX_TOKENS = 8;

/** User input → safe FTS5 query: words only, each quoted with prefix matching, ANDed. */
export function toMatchQuery(input: string): string | null {
  const tokens = (input.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TOKENS);
  return tokens.length > 0 ? tokens.map((token) => `"${token}"*`).join(" ") : null;
}

/** Splits an FTS snippet into plain and highlighted parts (rendered as text, never HTML). */
export function splitSnippet(raw: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  for (const [index, chunk] of raw.split(START).entries()) {
    if (index === 0) {
      if (chunk) parts.push({ text: chunk, hit: false });
      continue;
    }
    const [hit = "", rest = ""] = chunk.split(END);
    if (hit) parts.push({ text: hit, hit: true });
    if (rest) parts.push({ text: rest, hit: false });
  }
  return parts;
}

/** Full-text search over titles and bodies, best matches first. */
export function searchBrain(db: Db, input: string, limit = 20): SearchHit[] {
  const match = toMatchQuery(input.slice(0, 200));
  if (!match) return [];
  const rows = db.all<{ path: string; title: string; snippet: string }>(sql`
    SELECT path, title, snippet(brain_fts, 2, ${START}, ${END}, '…', 12) AS snippet
    FROM brain_fts WHERE brain_fts MATCH ${match} ORDER BY rank LIMIT ${limit}`);
  return rows.map((row) => ({ path: row.path, title: row.title, snippet: splitSnippet(row.snippet) }));
}
```

- [ ] **Step 8: Implement `lib/brain/views.ts`**

```ts
import { desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { brainDocs, brainLinks } from "@/lib/db/schema";

/** Records that the owner opened a document (clears its "new" badge). */
export function markViewed(db: Db, path: string, now: Date = new Date()): void {
  db.update(brainDocs).set({ lastViewedAt: now }).where(eq(brainDocs.path, path)).run();
}

/** Documents never opened, or changed since they were last opened. */
export function newDocPaths(db: Db): Set<string> {
  const rows = db
    .select({ path: brainDocs.path })
    .from(brainDocs)
    .where(or(isNull(brainDocs.lastViewedAt), gt(brainDocs.mtime, brainDocs.lastViewedAt)))
    .all();
  return new Set(rows.map((row) => row.path));
}

/** Documents that wiki-link to `path`, by title. */
export function backlinks(db: Db, path: string): { path: string; title: string }[] {
  return db
    .select({ path: brainDocs.path, title: brainDocs.title })
    .from(brainLinks)
    .innerJoin(brainDocs, eq(brainLinks.fromPath, brainDocs.path))
    .where(eq(brainLinks.toPath, path))
    .orderBy(brainDocs.title)
    .all();
}

/** Most recently changed documents. */
export function recentDocs(db: Db, limit = 10) {
  return db
    .select({ path: brainDocs.path, title: brainDocs.title, mtime: brainDocs.mtime })
    .from(brainDocs)
    .orderBy(desc(brainDocs.mtime))
    .limit(limit)
    .all();
}
```

- [ ] **Step 9: Implement `lib/brain/watch-filter.ts` and `lib/brain/runtime.ts`**

`lib/brain/watch-filter.ts`:
```ts
/** Git internals and hidden files never affect the index. */
export function isIgnoredChange(filename: string | null): boolean {
  if (!filename) return false;
  return filename.split(/[\\/]/).some((segment) => segment.startsWith("."));
}
```

`lib/brain/runtime.ts`:

```ts
import "server-only";
import { type FSWatcher, watch } from "node:fs";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { checkBrainRoot } from "./docs";
import { reindexAll } from "./indexer";
import { createSingleFlight } from "./single-flight";
import { newDocPaths } from "./views";
import { isIgnoredChange } from "./watch-filter";

export type BrainStatus =
  | { available: true; root: string; watchError: string | null }
  | { available: false; root: string; reason: "missing" | "not-directory" | "unreadable" };

type Runtime = { watcher: FSWatcher | null; error: string | null; reindex: () => boolean };

const WATCH_DEBOUNCE_MS = 1000;
let runtime: Runtime | undefined;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function start(root: string): Runtime {
  const db = getDb();
  reindexAll(db, root); // synchronous first pass so the first page has data
  const state: Runtime = { watcher: null, error: null, reindex: () => false };
  const runner = createSingleFlight(
    () => {
      reindexAll(db, root);
    },
    (error) => {
      state.error = `Reindex failed: ${message(error)}`;
    },
    () => {
      if (state.error?.startsWith("Reindex failed")) state.error = null;
    },
  );
  state.reindex = () => runner.trigger(0);
  try {
    state.watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!isIgnoredChange(filename)) runner.trigger(WATCH_DEBOUNCE_MS);
    });
    state.watcher.on("error", (error) => {
      state.error = `File watcher stopped: ${message(error)}`;
    });
  } catch (error) {
    state.error = `File watcher unavailable: ${message(error)}`;
  }
  return state;
}

/** Brain availability; indexes and starts watching on first successful call. */
export function ensureBrain(): BrainStatus {
  const root = getConfig().HARBOUR_BRAIN_DIR;
  const status = checkBrainRoot(root);
  if (!status.ok) return { available: false, root, reason: status.reason };
  runtime ??= start(root);
  return { available: true, root, watchError: runtime.error };
}

/** Starts a reindex now; false if one is already queued or running. */
export function requestReindex(): boolean {
  return runtime ? runtime.reindex() : false;
}

/**
 * Count for the sidebar badge, or null if the brain is unavailable or failed to index.
 * The failure itself is shown on /brain, so the badge just hides.
 */
export function brainNewCount(): number | null {
  try {
    return ensureBrain().available ? newDocPaths(getDb()).size : null;
  } catch (error) {
    console.error("brain index unavailable", error);
    return null;
  }
}
```

- [ ] **Step 10: Run to verify pass**

Run: `pnpm vitest run lib/brain lib/db`
Expected: PASS.

- [ ] **Step 11: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add lib/db/schema.ts drizzle lib/brain
git commit -m "feat(brain): full-text index, backlinks, new-document tracking and file watching"
```

---

### Task 5: Viewer pages, API routes and editor link

**Files:**
- Modify: `lib/config.ts` (+ `lib/config.test.ts`), `lib/format/date.ts` (+ `lib/format/date.test.ts`), `.env.example`, `README.md`
- Create: `lib/brain/editor-url.ts`, `lib/brain/editor-url.test.ts`, `lib/brain/view-model.ts`, `app/(app)/brain/layout.tsx`, `app/(app)/brain/page.tsx`, `app/(app)/brain/[...path]/page.tsx`, `app/(app)/brain/prose.css`, `app/api/brain/search/route.ts`, `app/api/brain/reindex/route.ts`, `components/brain/BrainTree.tsx`, `components/brain/DocArticle.tsx`, `components/brain/DocMeta.tsx`, `components/brain/ContextRail.tsx`, `components/brain/BrainHeader.tsx`, `components/brain/ReindexButton.tsx`, `components/brain/BrainSetupNotice.tsx`, `components/brain/RecentDocs.tsx`

**Interfaces:**
- Consumes: Tasks 2–4; `requireSession`, `getSession`, `rejectCrossSite`, `jsonError`, `postJson`, UI primitives (`Panel`, `Tag`, `Button`).
- Produces: config `HARBOUR_EDITOR_URL_TEMPLATE: string` (default `vscode://file/{path}`, empty disables); `isoDateIn(timeZone: string, date: Date): string`; `formatDateTime(date: Date, timeZone: string, locale: string): string`; `editorUrlFor(template: string, absolutePath: string): string | null`; `type DocView`; `loadDocView(root: string, path: string, now?: Date): Promise<DocView>`; routes `GET /api/brain/search?q=` → `{ hits: SearchHit[] }`, `POST /api/brain/reindex` → `{ started: boolean }`; `BrainHeader` accepts `children` (Task 6 puts the search trigger there).

- [ ] **Step 1: Write failing tests**

Append to `lib/config.test.ts` (reuse its existing valid `base` env object):
```ts
describe("HARBOUR_EDITOR_URL_TEMPLATE", () => {
  it("defaults to VS Code and accepts an empty value to disable", () => {
    expect(parseConfig(base).HARBOUR_EDITOR_URL_TEMPLATE).toBe("vscode://file/{path}");
    expect(parseConfig({ ...base, HARBOUR_EDITOR_URL_TEMPLATE: "" }).HARBOUR_EDITOR_URL_TEMPLATE).toBe("");
  });
  it("requires a {path} placeholder when set", () => {
    expect(() => parseConfig({ ...base, HARBOUR_EDITOR_URL_TEMPLATE: "vscode://file/" })).toThrow(/\{path\}/);
  });
});
```

Append to `lib/format/date.test.ts`:
```ts
import { formatDateTime, isoDateIn } from "./date";

describe("isoDateIn", () => {
  it("gives the calendar date in the zone", () => {
    expect(isoDateIn("Pacific/Honolulu", new Date("2026-10-02T05:00:00Z"))).toBe("2026-10-01");
  });
});

describe("formatDateTime", () => {
  it("includes date and time in the zone and locale", () => {
    const text = formatDateTime(new Date("2026-10-01T20:30:00Z"), "Pacific/Honolulu", "en-GB");
    expect(text).toMatch(/1 Oct 2026/);
    expect(text).toMatch(/10:30/);
  });
});
```

`lib/brain/editor-url.test.ts`:
```ts
import { editorUrlFor } from "./editor-url";

describe("editorUrlFor", () => {
  it("fills the path placeholder with an encoded absolute path", () => {
    expect(editorUrlFor("vscode://file/{path}", "/srv/brain/a b.md")).toBe("vscode://file//srv/brain/a%20b.md");
  });
  it("returns null when disabled", () => {
    expect(editorUrlFor("", "/srv/brain/a.md")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/config.test.ts lib/format lib/brain/editor-url.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement config, dates and editor URL**

In `lib/config.ts`, add to the object schema (after `HARBOUR_BRAIN_DIR`):
```ts
    HARBOUR_EDITOR_URL_TEMPLATE: z
      .string()
      .default("vscode://file/{path}")
      .refine((v) => v === "" || v.includes("{path}"), {
        message: "HARBOUR_EDITOR_URL_TEMPLATE must contain {path}, or be empty to hide the button",
      }),
```

Append to `lib/format/date.ts`:
```ts
/** YYYY-MM-DD for `date` as seen in `timeZone`. */
export function isoDateIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Medium date and short time, e.g. "1 Oct 2026, 10:30". */
export function formatDateTime(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
```

`lib/brain/editor-url.ts`:
```ts
/** Editor deep link for a file, or null when the template is empty (button hidden). */
export function editorUrlFor(template: string, absolutePath: string): string | null {
  return template ? template.replace("{path}", encodeURI(absolutePath)) : null;
}
```

`.env.example` — add after the HARBOUR_BRAIN_DIR lines:
```bash
# "Open in editor" link for Second Brain documents; {path} is the absolute file path.
# Leave empty to hide the button.
# HARBOUR_EDITOR_URL_TEMPLATE=vscode://file/{path}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run lib/config.test.ts lib/format lib/brain/editor-url.test.ts` → PASS.

- [ ] **Step 5: Implement `lib/brain/view-model.ts`**

```ts
import "server-only";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { type BrainDoc, readDoc } from "./docs";
import { editorUrlFor } from "./editor-url";
import { type OutlineItem, renderMarkdown, stripLeadingTitle } from "./render";
import { filePaths, listTree } from "./tree";
import { backlinks, markViewed } from "./views";
import { buildLinkIndex } from "./wikilinks";

export type DocView = {
  doc: BrainDoc;
  html: string;
  outline: OutlineItem[];
  backlinks: { path: string; title: string }[];
  editorUrl: string | null;
  stale: boolean;
};

/** Everything a document page needs. Throws BrainPathError for bad paths (render 404). */
export async function loadDocView(root: string, path: string, now = new Date()): Promise<DocView> {
  const db = getDb();
  const config = getConfig();
  const doc = readDoc(root, path);
  const index = buildLinkIndex(filePaths(listTree(root).nodes));
  const rendered = await renderMarkdown(stripLeadingTitle(doc.body, doc.title), index);
  markViewed(db, path, now);
  const reviewBy = doc.frontmatter.review_by;
  return {
    doc,
    html: rendered.html,
    outline: rendered.outline,
    backlinks: backlinks(db, path),
    editorUrl: editorUrlFor(config.HARBOUR_EDITOR_URL_TEMPLATE, doc.absolutePath),
    stale: reviewBy !== undefined && reviewBy < isoDateIn(config.HARBOUR_TIMEZONE, now),
  };
}
```

- [ ] **Step 6: Write the API routes**

`app/api/brain/search/route.ts`:
```ts
import { getSession } from "@/lib/auth/guard";
import { ensureBrain } from "@/lib/brain/runtime";
import { searchBrain } from "@/lib/brain/search";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";

export async function GET(request: Request) {
  if (!(await getSession())) return jsonError(401, "unauthenticated");
  if (!ensureBrain().available) return Response.json({ hits: [] });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ hits: searchBrain(getDb(), query) });
}
```

`app/api/brain/reindex/route.ts`:
```ts
import { getSession } from "@/lib/auth/guard";
import { ensureBrain, requestReindex } from "@/lib/brain/runtime";
import { getConfig } from "@/lib/config";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  if (!(await getSession())) return jsonError(401, "unauthenticated");
  if (!ensureBrain().available) return jsonError(409, "brain_unavailable");
  return Response.json({ started: requestReindex() });
}
```

- [ ] **Step 7: Write the brain components**

`components/brain/BrainTree.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeNode } from "@/lib/brain/tree";
import { brainHref } from "@/lib/brain/wikilinks";

function Nodes({ nodes, current, fresh }: { nodes: TreeNode[]; current: string; fresh: Set<string> }) {
  return (
    <ul className="flex flex-col gap-0.5 pl-2">
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <li key={node.path}>
            <details open={current.startsWith(brainHref(node.path))}>
              <summary className="cursor-pointer rounded-sm px-1.5 py-1 text-sm font-medium">
                {node.name}
              </summary>
              <Nodes nodes={node.children} current={current} fresh={fresh} />
            </details>
          </li>
        ) : (
          <li key={node.path}>
            <Link
              href={brainHref(node.path)}
              aria-current={current === brainHref(node.path) ? "page" : undefined}
              className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm text-ink-muted hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink"
            >
              <span className="truncate">{node.name.replace(/\.md$/, "")}</span>
              {fresh.has(node.path) && (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent">
                  <span className="sr-only">new</span>
                </span>
              )}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

/** Folder tree with the current document highlighted and new documents dotted. */
export function BrainTree({
  nodes,
  freshPaths,
  truncated,
}: {
  nodes: TreeNode[];
  freshPaths: string[];
  truncated: boolean;
}) {
  const current = usePathname();
  return (
    <div className="-ml-2">
      <Nodes nodes={nodes} current={current} fresh={new Set(freshPaths)} />
      {truncated && <p className="px-2 pt-2 text-xs text-warn">Tree truncated at 5,000 documents.</p>}
    </div>
  );
}
```

`components/brain/DocMeta.tsx`:
```tsx
import { Tag } from "@/components/ui/Tag";
import type { Frontmatter } from "@/lib/brain/frontmatter";

/** Frontmatter pills: tags, research date, confidence, and a stale warning. */
export function DocMeta({ frontmatter, stale }: { frontmatter: Frontmatter; stale: boolean }) {
  const { tags = [], researched, confidence, review_by } = frontmatter;
  if (tags.length === 0 && !researched && !confidence && !stale) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Tag key={tag}>{tag}</Tag>
      ))}
      {researched && <Tag tone="neutral">Researched {researched}</Tag>}
      {confidence && <Tag tone="neutral">Confidence: {confidence}</Tag>}
      {stale && <Tag tone="warn">Stale — review was due {review_by}</Tag>}
    </div>
  );
}
```

`components/brain/ContextRail.tsx`:
```tsx
import Link from "next/link";
import type { OutlineItem } from "@/lib/brain/render";
import { brainHref } from "@/lib/brain/wikilinks";

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname : url;
}

const HEADING = "text-2xs uppercase tracking-widest text-ink-muted";

/** Outline, backlinks and sources beside (or below) the document. */
export function ContextRail({
  outline,
  linkedFrom,
  sources,
}: {
  outline: OutlineItem[];
  linkedFrom: { path: string; title: string }[];
  sources: string[];
}) {
  return (
    <aside aria-label="Document context" className="flex flex-col gap-6 text-sm">
      {outline.length > 0 && (
        <section>
          <h2 className={HEADING}>On this page</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {outline.map((item) => (
              <li key={item.id} className={item.depth === 3 ? "pl-3" : undefined}>
                <a href={`#${item.id}`} className="text-ink-muted hover:text-ink">
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {linkedFrom.length > 0 && (
        <section>
          <h2 className={HEADING}>Linked from</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {linkedFrom.map((link) => (
              <li key={link.path}>
                <Link href={brainHref(link.path)} className="text-accent hover:underline">
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sources.length > 0 && (
        <section>
          <h2 className={HEADING}>Sources · {sources.length}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {sources.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-ink">
                  ↗ {hostOf(url)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
```

`components/brain/DocArticle.tsx`:
```tsx
import type { DocView } from "@/lib/brain/view-model";
import { ContextRail } from "./ContextRail";
import { DocMeta } from "./DocMeta";

/** A rendered document with its metadata and context rail. */
export function DocArticle({ view }: { view: DocView }) {
  const { doc } = view;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 rounded-md border border-line bg-surface px-6 py-7 sm:px-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-xs text-ink-muted">{doc.path}</p>
          {view.editorUrl && (
            <a href={view.editorUrl} className="text-xs text-accent hover:underline">
              Open in editor
            </a>
          )}
        </div>
        <h1 className="mt-2 font-serif text-3xl leading-tight">{doc.title}</h1>
        <DocMeta frontmatter={doc.frontmatter} stale={view.stale} />
        {doc.frontmatterError && (
          <p role="note" className="mt-4 rounded-sm bg-warn-soft px-3 py-2 text-xs text-warn">
            Frontmatter invalid — showing the document without it: {doc.frontmatterError}
          </p>
        )}
        <div
          className="brain-prose mt-6"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitised by rehype-sanitize in lib/brain/render.ts
          dangerouslySetInnerHTML={{ __html: view.html }}
        />
      </article>
      <ContextRail
        outline={view.outline}
        linkedFrom={view.backlinks}
        sources={doc.frontmatter.sources ?? []}
      />
    </div>
  );
}
```

`components/brain/ReindexButton.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

/** Asks the server to rebuild the search index; reports whether it started. */
export function ReindexButton() {
  const [state, setState] = useState<"idle" | "busy" | "started" | "running" | "failed">("idle");
  async function reindex() {
    setState("busy");
    const result = await postJson<{ started: boolean }>("/api/brain/reindex");
    if (!result.ok) return setState("failed");
    setState(result.data.started ? "started" : "running");
  }
  const label = { idle: "Reindex", busy: "Reindexing…", started: "Reindex started", running: "Already reindexing", failed: "Reindex failed — retry" }[state];
  return (
    <Button variant="ghost" onClick={reindex} disabled={state === "busy"}>
      <span aria-live="polite">{label}</span>
    </Button>
  );
}
```

`components/brain/BrainHeader.tsx`:
```tsx
import type { ReactNode } from "react";
import { ReindexButton } from "./ReindexButton";

/** Page title, search slot, and any index/watcher problem. */
export function BrainHeader({ watchError, children }: { watchError: string | null; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Second Brain</h1>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {watchError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn">
          <span>Search index may be stale: {watchError}</span>
          <ReindexButton />
        </div>
      )}
    </header>
  );
}
```

`components/brain/BrainSetupNotice.tsx`:
```tsx
import { Panel } from "@/components/ui/Panel";

const REASONS = {
  missing: "doesn't exist yet",
  "not-directory": "isn't a folder",
  unreadable: "can't be read by Harbour",
} as const;

/** Shown instead of the viewer when HARBOUR_BRAIN_DIR is not usable. */
export function BrainSetupNotice({ root, reason }: { root: string; reason: keyof typeof REASONS }) {
  return (
    <Panel className="mx-auto max-w-2xl p-6">
      <h1 className="font-serif text-2xl">Set up your Second Brain</h1>
      <p className="mt-3 text-sm">
        Harbour reads Markdown documents from <code className="font-mono">{root}</code>, which {REASONS[reason]}.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>Create a folder for your notes — ideally its own private git repository.</li>
        <li>Set <code className="font-mono">HARBOUR_BRAIN_DIR</code> in <code className="font-mono">.env</code> to its path.</li>
        <li>Restart Harbour.</li>
      </ol>
    </Panel>
  );
}
```

`components/brain/RecentDocs.tsx`:
```tsx
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { brainHref } from "@/lib/brain/wikilinks";

/** Fallback start page: recently changed documents. */
export function RecentDocs({ docs }: { docs: { path: string; title: string }[] }) {
  return (
    <Panel className="p-6">
      <h2 className="font-serif text-xl">Recently changed</h2>
      {docs.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No documents yet. Add Markdown files to your brain folder.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {docs.map((doc) => (
            <li key={doc.path}>
              <Link href={brainHref(doc.path)} className="text-accent hover:underline">{doc.title}</Link>
              <span className="ml-2 font-mono text-xs text-ink-muted">{doc.path}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-ink-muted">Tip: create <code className="font-mono">00-start-here.md</code> to use it as this page.</p>
    </Panel>
  );
}
```

- [ ] **Step 8: Write the pages and prose styles**

`app/(app)/brain/prose.css`:
```css
.brain-prose {
  font-family: var(--font-serif);
  font-size: 1.0625rem;
  line-height: 1.7;
  max-width: 65ch;
  color: var(--ink);
}
.brain-prose > * + * { margin-top: 0.9em; }
.brain-prose h2 { font-size: 1.375rem; font-weight: 500; margin-top: 1.6em; line-height: 1.3; }
.brain-prose h3 { font-size: 1.125rem; font-weight: 500; margin-top: 1.3em; }
.brain-prose a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
.brain-prose a.wikilink { text-decoration-style: dotted; }
.brain-prose .wikilink-broken { color: var(--ink-muted); text-decoration: line-through; font-style: normal; }
.brain-prose ul { list-style: disc; padding-left: 1.4em; }
.brain-prose ol { list-style: decimal; padding-left: 1.4em; }
.brain-prose li + li { margin-top: 0.25em; }
.brain-prose blockquote { border-left: 3px solid var(--accent); background: var(--accent-soft); padding: 0.5em 1em; border-radius: 0 var(--radius-md) var(--radius-md) 0; }
.brain-prose code { font-family: var(--font-mono); font-size: 0.85em; background: var(--surface-sunk); padding: 0.1em 0.3em; border-radius: var(--radius-sm); }
.brain-prose pre { background: var(--surface-sunk); padding: 1em; border-radius: var(--radius-md); overflow-x: auto; }
.brain-prose pre code { background: none; padding: 0; }
.brain-prose table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 0.875rem; }
.brain-prose th, .brain-prose td { border-bottom: 1px solid var(--line); padding: 0.4em 0.6em; text-align: left; }
.brain-prose hr { border: 0; border-top: 1px solid var(--line); }
.brain-prose mark { background: var(--warn-soft); color: var(--ink); }
```

`app/(app)/brain/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { BrainHeader } from "@/components/brain/BrainHeader";
import { BrainSetupNotice } from "@/components/brain/BrainSetupNotice";
import { BrainTree } from "@/components/brain/BrainTree";
import { requireSession } from "@/lib/auth/guard";
import { ensureBrain } from "@/lib/brain/runtime";
import { listTree } from "@/lib/brain/tree";
import { newDocPaths } from "@/lib/brain/views";
import { getDb } from "@/lib/db/client";
import "./prose.css";

export default async function BrainLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return <BrainSetupNotice root={status.root} reason={status.reason} />;
  const { nodes, truncated } = listTree(status.root);
  const fresh = [...newDocPaths(getDb())];
  const tree = <BrainTree nodes={nodes} freshPaths={fresh} truncated={truncated} />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <BrainHeader watchError={status.watchError} />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <details className="rounded-md border border-line bg-surface p-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium">Browse documents</summary>
          <div className="mt-2">{tree}</div>
        </details>
        <nav aria-label="Documents" className="hidden lg:block">
          {tree}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
```

`app/(app)/brain/page.tsx`:
```tsx
import { DocArticle } from "@/components/brain/DocArticle";
import { RecentDocs } from "@/components/brain/RecentDocs";
import { requireSession } from "@/lib/auth/guard";
import { BrainPathError, resolveBrainPath } from "@/lib/brain/paths";
import { ensureBrain } from "@/lib/brain/runtime";
import { loadDocView } from "@/lib/brain/view-model";
import { recentDocs } from "@/lib/brain/views";
import { getDb } from "@/lib/db/client";

const START_DOC = "00-start-here.md";

function exists(root: string, path: string): boolean {
  try {
    resolveBrainPath(root, path);
    return true;
  } catch (error) {
    if (error instanceof BrainPathError) return false;
    throw error;
  }
}

export default async function BrainHomePage() {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return null; // the layout shows the setup notice
  if (exists(status.root, START_DOC)) {
    return <DocArticle view={await loadDocView(status.root, START_DOC)} />;
  }
  return <RecentDocs docs={recentDocs(getDb())} />;
}
```

`app/(app)/brain/[...path]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/brain/DocArticle";
import { requireSession } from "@/lib/auth/guard";
import { BrainPathError } from "@/lib/brain/paths";
import { ensureBrain } from "@/lib/brain/runtime";
import { type DocView, loadDocView } from "@/lib/brain/view-model";

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export default async function BrainDocPage({ params }: { params: Promise<{ path: string[] }> }) {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return null; // the layout shows the setup notice
  const { path } = await params;
  let view: DocView;
  try {
    view = await loadDocView(status.root, path.map(decode).join("/"));
  } catch (error) {
    if (error instanceof BrainPathError) notFound();
    throw error;
  }
  return <DocArticle view={view} />;
}
```

- [ ] **Step 9: README**

In `README.md`:
1. In the configuration table add a row:
   `| HARBOUR_EDITOR_URL_TEMPLATE | vscode://file/{path} | "Open in editor" link for Second Brain documents. {path} is the absolute file path; empty hides the button. |`
2. Add a section after the features/overview:
```markdown
## Second Brain

Harbour shows the Markdown files in `HARBOUR_BRAIN_DIR` at `/brain`: a folder tree, a
reading view with an outline, links between notes (`[[note-name]]` or
`[[note-name|label]]`), backlinks, and sources from frontmatter. Press **⌘K** (or
**Ctrl+K**) to search everything. New and changed notes are marked until you open them.

Keep the brain in its own **private** git repository — it holds your research and plans,
which must never be committed to this public repo. Optional frontmatter:

```yaml
title: How AI engines pick their sources
tags: [geo]
researched: 2026-10-01
confidence: medium      # low | medium | high
review_by: 2027-01-01   # shows a "stale" badge after this date
sources: [https://example.com/article]
```
```
(Use four-backtick fences in the actual README if needed so the nested yaml block renders.)

- [ ] **Step 10: Build and smoke-check**

Run: `pnpm check && pnpm build`
Expected: PASS; build lists `/brain`, `/brain/[...path]`, `/api/brain/search`, `/api/brain/reindex`.

- [ ] **Step 11: Commit**

```bash
git add lib app components .env.example README.md
git commit -m "feat(brain): Second Brain viewer with tree, rendered documents, context rail and editor link"
```

---

### Task 6: ⌘K search dialog

**Files:**
- Create: `components/brain/useBrainSearch.ts`, `components/brain/SearchDialog.tsx`, `components/brain/SearchDialog.test.tsx`
- Modify: `app/(app)/brain/layout.tsx` (put `<SearchDialog />` inside `<BrainHeader>`)

**Interfaces:**
- Consumes: `GET /api/brain/search?q=` → `{ hits: SearchHit[] }`; `type SearchHit` (type-only import from `@/lib/brain/search`); `brainHref`.
- Produces: `useBrainSearch(query: string): { hits: SearchHit[]; loading: boolean; error: string | null }`; `SearchDialog` (no props).

- [ ] **Step 1: Write the failing test `components/brain/SearchDialog.test.tsx`**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchDialog } from "./SearchDialog";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const hit = {
  path: "research/geo/how-ai-engines-pick-sources.md",
  title: "How AI engines pick their sources",
  snippet: [
    { text: "…", hit: false },
    { text: "Perplexity", hit: true },
    { text: " cites", hit: false },
  ],
};

function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

describe("SearchDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
  });

  it("opens with Ctrl+K, searches, and opens the chosen result with Enter", async () => {
    stubFetch(Response.json({ hits: [hit] }));
    render(<SearchDialog />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Search the Second Brain" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "perplex" } });
    const option = await screen.findByRole("option", { name: /How AI engines pick their sources/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Perplexity").tagName).toBe("MARK");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/brain/research/geo/how-ai-engines-pick-sources.md");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the trigger", () => {
    stubFetch(Response.json({ hits: [] }));
    render(<SearchDialog />);
    const trigger = screen.getByRole("button", { name: /Search/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows an error when search fails", async () => {
    stubFetch(new Response("nope", { status: 500 }));
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Search failed"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run components/brain/SearchDialog.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `components/brain/useBrainSearch.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import type { SearchHit } from "@/lib/brain/search";

const DEBOUNCE_MS = 150;

/** Debounced, cancellable search against /api/brain/search. */
export function useBrainSearch(query: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/brain/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setHits([]);
        setError(cause instanceof Error ? `Search failed (${cause.message})` : "Search failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { hits, loading, error };
}
```

- [ ] **Step 4: Implement `components/brain/SearchDialog.tsx`**

```tsx
"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { SearchHit } from "@/lib/brain/search";
import { brainHref } from "@/lib/brain/wikilinks";
import { useBrainSearch } from "./useBrainSearch";

/** ⌘K / Ctrl+K command dialog searching every brain document. */
export function SearchDialog() {
  const router = useRouter();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { hits, loading, error } = useBrainSearch(open ? query : "");

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [hits]);

  function close() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    router.push(brainHref(hit.path));
  }

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) go(hit);
    } else if (event.key === "Escape") {
      close();
    } else if (event.key === "Tab") {
      event.preventDefault(); // keep focus inside the dialog
    }
  }

  const status = error ? null : loading ? "Searching…" : query.trim() && hits.length === 0 ? "No results" : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <Search aria-hidden="true" className="size-4" />
        <span>Search</span>
        <kbd className="font-mono text-2xs">⌘K</kbd>
      </button>
      {open && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 p-4 pt-24"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Search the Second Brain" className="w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Search the Second Brain"
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search notes…"
              className="w-full border-b border-line bg-surface px-4 py-3 text-base outline-none"
            />
            <ul id={listId} role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto">
              {hits.map((hit, index) => (
                <li
                  key={hit.path}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(hit);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className="cursor-pointer px-4 py-2.5 aria-selected:bg-surface-sunk"
                >
                  <p className="text-sm text-ink">{hit.title}</p>
                  <p className="font-mono text-2xs text-ink-muted">{hit.path}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {hit.snippet.map((part, i) =>
                      part.hit ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: snippet parts are static per render
                        <mark key={i} className="bg-warn-soft text-ink">{part.text}</mark>
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: snippet parts are static per render
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="px-4 py-3 text-sm text-bad">{error}</p>}
            <p aria-live="polite" className="px-4 py-2 text-xs text-ink-muted">{status}</p>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Mount it**

In `app/(app)/brain/layout.tsx`, import `SearchDialog` from `@/components/brain/SearchDialog` and change the header line to:
```tsx
      <BrainHeader watchError={status.watchError}>
        <SearchDialog />
      </BrainHeader>
```

- [ ] **Step 6: Run tests, gate, commit**

Run: `pnpm vitest run components/brain && pnpm check` → PASS.
```bash
git add components/brain "app/(app)/brain/layout.tsx"
git commit -m "feat(brain): keyboard-first search dialog"
```

---

### Task 7: Sidebar link with new-document count

**Files:**
- Modify: `components/shell/nav-items.ts`, `components/shell/NavLink.tsx`, `components/shell/NavLink.test.tsx`, `components/shell/Sidebar.tsx`

**Interfaces:**
- Consumes: `brainNewCount(): number | null` (Task 4).
- Produces: `type NavItem = { label: string; href?: string; soon?: boolean; badge?: "brain-new" }`; `NavLink` prop `badge?: { count: number; label: string }`.

- [ ] **Step 1: Write failing tests — append to `components/shell/NavLink.test.tsx`**

(The file already mocks `next/navigation`'s `usePathname`; reuse that mock.)
```tsx
describe("NavLink badge", () => {
  it("shows a count with an accessible label", () => {
    render(<NavLink href="/brain" badge={{ count: 3, label: "3 new documents" }}>Second Brain</NavLink>);
    const link = screen.getByRole("link", { name: /Second Brain/ });
    expect(link).toHaveTextContent("3");
    expect(screen.getByText("3 new documents")).toHaveClass("sr-only");
  });

  it("hides the badge at zero", () => {
    render(<NavLink href="/brain" badge={{ count: 0, label: "0 new documents" }}>Second Brain</NavLink>);
    expect(screen.queryByText("0 new documents")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run components/shell/NavLink.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`components/shell/nav-items.ts`:
```ts
export type NavItem = { label: string; href?: string; soon?: boolean; badge?: "brain-new" };

/** Primary navigation. Items marked `soon` render disabled until their phase ships. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/" },
  { label: "Actions", soon: true },
  { label: "Second Brain", href: "/brain", badge: "brain-new" },
  { label: "Agents", soon: true },
  { label: "Devices", href: "/settings/devices" },
  { label: "Design system", href: "/design" },
];
```

`components/shell/NavLink.tsx` — change the signature and add the badge inside the `<Link>` after `{children}`:
```tsx
export function NavLink({
  href,
  badge,
  children,
}: {
  href?: string;
  badge?: { count: number; label: string };
  children: ReactNode;
}) {
```
and inside the Link:
```tsx
      {children}
      {badge && badge.count > 0 && (
        <span className="ml-auto rounded-full bg-accent-soft px-1.5 text-2xs text-accent">
          <span aria-hidden="true">{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )}
```

`components/shell/Sidebar.tsx` — import `brainNewCount` from `@/lib/brain/runtime`, compute once, and pass to the brain item:
```tsx
  const brainNew = brainNewCount();
```
```tsx
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            href={item.href}
            badge={
              item.badge === "brain-new" && brainNew !== null
                ? { count: brainNew, label: `${brainNew} new documents` }
                : undefined
            }
          >
            {item.label}
          </NavLink>
        ))}
```

- [ ] **Step 4: Run tests, gate, commit**

Run: `pnpm vitest run components/shell && pnpm check` → PASS.
```bash
git add components/shell
git commit -m "feat(shell): live Second Brain link with new-document count"
```

---

### Task 8: Install as an app (manifest and icons)

**Files:**
- Create: `design/brand.ts`, `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/icons/[variant]/route.tsx`, `lib/brand/icon-art.tsx`
- Modify: `lib/auth/paths.ts`, `lib/auth/gate.test.ts`, `app/layout.tsx`, `README.md`

**Interfaces:**
- Produces: `BRAND = { name: "Harbour", background: string, theme: string, ink: string }`; `HarbourMark({ size, inset }: { size: number; inset: number })` JSX for ImageResponse; public paths `/manifest.webmanifest`, `/icon`, `/apple-icon`, `/icons/*`.

- [ ] **Step 1: Write failing tests — append to `lib/auth/gate.test.ts`**

(Reuse the file's `config` and identity-header `me` fixtures.)
```ts
describe("app-install assets", () => {
  it.each(["/manifest.webmanifest", "/icon", "/apple-icon", "/icons/192", "/icons/maskable-512"])(
    "%s needs Tailscale identity but no session",
    (pathname) => {
      expect(decideGate({ headers: me, pathname, hasSessionCookie: false }, config).kind).toBe("next");
      expect(decideGate({ headers: new Headers(), pathname, hasSessionCookie: false }, config)).toEqual({
        kind: "forbid",
      });
    },
  );

  it("does not open look-alike paths", () => {
    expect(decideGate({ headers: me, pathname: "/iconsx", hasSessionCookie: false }, config).kind).not.toBe("next");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/auth/gate.test.ts` → FAIL.

- [ ] **Step 3: Update `lib/auth/paths.ts`**

```ts
// Reachable with a Tailscale identity but before a passkey session exists.
// App-install assets are included because browsers fetch them without cookies.
const PUBLIC_EXACT = ["/login", "/setup", "/manifest.webmanifest", "/icon", "/apple-icon"];
const PUBLIC_PREFIXES = ["/api/auth/", "/icons/"];

/** True for pages and endpoints used to obtain a session, and app-install assets. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run lib/auth` → PASS.

- [ ] **Step 5: Brand values and icon art**

`design/brand.ts` (hex allowed under `design/`):
```ts
/** Brand colours for places that cannot read CSS variables (manifest, generated icons). */
export const BRAND = {
  name: "Harbour",
  background: "#f6f2ea",
  theme: "#1f6b5a",
  ink: "#fffdf8",
} as const;
```

`lib/brand/icon-art.tsx`:
```tsx
import { BRAND } from "@/design/brand";

/** The Harbour mark: a serif "H" on tide green. `inset` (0–0.3) adds a maskable safe zone. */
export function HarbourMark({ size, inset }: { size: number; inset: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.theme,
        color: BRAND.ink,
        fontSize: size * (0.62 - inset),
        fontFamily: "serif",
        borderRadius: inset > 0 ? 0 : size * 0.2,
      }}
    >
      H
    </div>
  );
}
```

- [ ] **Step 6: Manifest, icons and theme colour**

`app/manifest.ts`:
```ts
import type { MetadataRoute } from "next";
import { BRAND } from "@/design/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: "A calm, private control centre for your projects",
    start_url: "/",
    display: "standalone",
    background_color: BRAND.background,
    theme_color: BRAND.theme,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

`app/icons/[variant]/route.tsx`:
```tsx
import { ImageResponse } from "next/og";
import { HarbourMark } from "@/lib/brand/icon-art";

const VARIANTS: Record<string, { size: number; inset: number }> = {
  "192": { size: 192, inset: 0 },
  "512": { size: 512, inset: 0 },
  "maskable-512": { size: 512, inset: 0.12 },
};

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const variant = VARIANTS[(await params).variant];
  if (!variant) return new Response("Not found", { status: 404 });
  return new ImageResponse(<HarbourMark size={variant.size} inset={variant.inset} />, {
    width: variant.size,
    height: variant.size,
  });
}
```

`app/icon.tsx`:
```tsx
import { ImageResponse } from "next/og";
import { HarbourMark } from "@/lib/brand/icon-art";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<HarbourMark size={64} inset={0} />, size);
}
```

`app/apple-icon.tsx`:
```tsx
import { ImageResponse } from "next/og";
import { HarbourMark } from "@/lib/brand/icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<HarbourMark size={180} inset={0} />, size);
}
```

`app/layout.tsx` — add after the `metadata` export:
```tsx
export const viewport: Viewport = { themeColor: BRAND.theme };
```
with imports `import type { Metadata, Viewport } from "next";` and `import { BRAND } from "@/design/brand";`. Also add `applicationName: BRAND.name,` to `metadata`.

If `pnpm check:files` flags `app/icon.tsx` or others for hex colours, the colour came from somewhere other than `BRAND` — fix the source, never the check.

- [ ] **Step 7: README**

Add to `README.md` under the Second Brain section (or a new "Using Harbour" section):
```markdown
### Install as an app

Harbour can be installed like an app, with its own window and icon. In Chrome or Edge, open
Harbour and choose **Install Harbour** from the address bar or menu; on Android choose
**Add to Home screen**; on iPhone and iPad use **Share → Add to Home Screen**. Harbour needs
a live connection to your PC, so it has no offline mode.
```

- [ ] **Step 8: Verify, gate, commit**

Run: `pnpm check && pnpm build` → PASS; build output includes `/manifest.webmanifest`, `/icon`, `/apple-icon`, `/icons/[variant]`.
```bash
git add design/brand.ts lib/brand lib/auth app README.md
git commit -m "feat: installable app manifest and icons"
```

---

### Task 9: Devices page improvements

**Files:**
- Modify: `lib/auth/sessions.ts` (+ test), `lib/auth/guard.ts`, `lib/auth/devices.ts` (+ test), `app/(app)/settings/devices/page.tsx`, `components/settings/DeviceList.tsx` (+ test), `app/api/auth/register/verify/route.ts`, `components/auth/PasskeySetup.tsx`

**Interfaces:**
- Produces: `validateSession(...)` returns `{ login: string; expiresAt: Date; passkeyId: string | null } | null`; `DeviceSummary` gains `current: boolean`; `listDevices(db, login, currentPasskeyId?: string | null)`; `uniqueDeviceLabel(existing: string[], label: string): string`; register verify response `{ ok: true, deviceLabel: string, renamed: boolean }`.

- [ ] **Step 1: Write failing tests**

Append to `lib/auth/sessions.test.ts`:
```ts
it("returns the passkey that signed the session in", () => {
  const db = openTestDb();
  const { token } = createSession(db, "owner@example.com", "cred-1", t0);
  expect(validateSession(db, token, "owner@example.com", t0)?.passkeyId).toBe("cred-1");
});
```
(Use the file's existing `t0` fixture and imports.)

Append to `lib/auth/devices.test.ts`:
```ts
import { uniqueDeviceLabel } from "./devices";

describe("uniqueDeviceLabel", () => {
  it("keeps a new name and suffixes a taken one", () => {
    expect(uniqueDeviceLabel(["Laptop"], "Phone")).toBe("Phone");
    expect(uniqueDeviceLabel(["Laptop"], "laptop ")).toBe("laptop 2");
    expect(uniqueDeviceLabel(["Laptop", "Laptop 2"], "Laptop")).toBe("Laptop 3");
  });
});

describe("listDevices current flag", () => {
  it("marks the passkey behind the current session", () => {
    const db = seed(); // existing helper in this file
    const devices = listDevices(db, "owner@example.com", "a");
    expect(devices.find((d) => d.id === "a")?.current).toBe(true);
    expect(devices.find((d) => d.id === "b")?.current).toBe(false);
  });
});
```
(If the file's seed helper uses a different fixture login, use that login.)

Append to `components/settings/DeviceList.test.tsx` (reuse its router mock and render helpers):
```tsx
it("shows date and time, marks this device, and warns before signing yourself out", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <DeviceList
      timeZone="Pacific/Honolulu"
      locale="en-GB"
      devices={[
        { id: "a", deviceLabel: "Laptop", createdAt: new Date("2026-10-01T20:30:00Z"), lastUsedAt: null, current: true },
      ]}
    />,
  );
  expect(screen.getByText("This device")).toBeInTheDocument();
  expect(screen.getByText(/1 Oct 2026, 10:30/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove Laptop" }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("This will sign you out on this device"));
  confirm.mockRestore();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/auth components/settings` → new tests FAIL.

- [ ] **Step 3: Implement**

`lib/auth/sessions.ts` — in `validateSession`, both return statements include the passkey:
```ts
    return { login: row.login, expiresAt: row.expiresAt, passkeyId: row.passkeyId };
```
and
```ts
  return { login: row.login, expiresAt, passkeyId: row.passkeyId };
```
(`lib/auth/guard.ts` returns `validateSession`'s result unchanged, so `getSession()`/`requireSession()` now expose `passkeyId`; no code change there beyond confirming types compile.)

`lib/auth/devices.ts`:
- Add `current: boolean;` to `DeviceSummary`.
- Change `listDevices` to:
```ts
export function listDevices(db: Db, login: string, currentPasskeyId: string | null = null): DeviceSummary[] {
  return db
    .select({
      id: passkeys.id,
      deviceLabel: passkeys.deviceLabel,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.login, login))
    .orderBy(asc(passkeys.createdAt))
    .all()
    .map((device) => ({ ...device, current: device.id === currentPasskeyId }));
}
```
- Add:
```ts
/** A device name not yet used by this login: "Laptop", else "Laptop 2", "Laptop 3"… */
export function uniqueDeviceLabel(existing: string[], label: string): string {
  const base = label.trim();
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}
```

`app/(app)/settings/devices/page.tsx` — pass the current passkey:
```tsx
  const devices = listDevices(getDb(), session.login, session.passkeyId);
```

`components/settings/DeviceList.tsx`:
- Replace the `fmt` helper with:
```tsx
import { formatDateTime } from "@/lib/format/date";
import { Tag } from "@/components/ui/Tag";

const fmt = (d: Date | null, timeZone: string, locale: string) =>
  d ? formatDateTime(new Date(d), timeZone, locale) : "never";
```
- In `remove`, use:
```tsx
    const warning = device.current ? " This will sign you out on this device." : "";
    if (!window.confirm(`Remove the passkey for “${device.deviceLabel}”?${warning}`)) return;
```
and after a successful removal of the current device, send the user to login instead of refreshing:
```tsx
    if (device.current) return router.replace("/login");
    router.refresh();
```
- In the row, after the label:
```tsx
              <p className="flex items-center gap-2 text-sm">
                {device.deviceLabel}
                {device.current && <Tag tone="neutral">This device</Tag>}
              </p>
```

`app/api/auth/register/verify/route.ts` — after `const db = getDb();` and before `finishRegistration`, compute a unique label and use it; change the success response:
```ts
  const deviceLabel = uniqueDeviceLabel(
    listDevices(db, login).map((device) => device.deviceLabel),
    body.data.deviceLabel,
  );
```
pass `deviceLabel` (instead of `body.data.deviceLabel`) into `finishRegistration`, and return:
```ts
  return Response.json({ ok: true, deviceLabel, renamed: deviceLabel !== body.data.deviceLabel.trim() });
```
(import `listDevices, uniqueDeviceLabel` from `@/lib/auth/devices`).

`components/auth/PasskeySetup.tsx`:
- Add state `const [savedAs, setSavedAs] = useState<string | null>(null);`
- Change the verify call and success handling to:
```tsx
      const verified = await postJson<{ deviceLabel: string; renamed: boolean }>(
        "/api/auth/register/verify",
        { response, deviceLabel },
      );
      if (!verified.ok) return fail(verified.error);
      if (verified.data.renamed) {
        setBusy(false);
        return setSavedAs(verified.data.deviceLabel);
      }
      router.replace("/");
```
- Before the `return (<form …`, add:
```tsx
  if (savedAs) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Saved as “{savedAs}” because that name was already used.
        </p>
        <Button onClick={() => router.replace("/")} className="w-full justify-center">
          Continue
        </Button>
      </div>
    );
  }
```

- [ ] **Step 4: Run tests, gate, commit**

Run: `pnpm vitest run lib/auth components && pnpm check` → PASS.
```bash
git add lib/auth components "app/(app)/settings" app/api/auth
git commit -m "feat(devices): show times and this device, unique names, honest sign-out warning"
```

---

### Task 10: End-to-end coverage

**Files:**
- Create: `tests/fixtures/brain/00-start-here.md`, `tests/fixtures/brain/research/geo/how-ai-engines-pick-sources.md`, `tests/fixtures/brain/research/glossary.md`, `tests/fixtures/brain/research/bad-frontmatter.md`, `tests/e2e/brain.spec.ts`
- Modify: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/shell.spec.ts` (devices "This device" check)

**Interfaces:**
- Consumes: everything above; `passkeys` table; `createSession(db, login, passkeyId)`.

- [ ] **Step 1: Fixture brain (fictional content only)**

`tests/fixtures/brain/00-start-here.md`:
```markdown
---
title: Start here
tags: [guide]
---
Welcome. Read [[how-ai-engines-pick-sources]] and the [[glossary]].
```

`tests/fixtures/brain/research/geo/how-ai-engines-pick-sources.md`:
```markdown
---
title: How AI engines pick their sources
tags: [geo]
researched: 2026-01-10
confidence: medium
review_by: 2026-02-01
sources: [https://example.com/geo-study]
---
# How AI engines pick their sources

Perplexity and other engines cite pages with clear, self-contained answers. See the
[[glossary|glossary]] and [[missing-note]].

<script>window.__pwned = true</script>

## Signals that matter

[An external study](https://example.com/geo-study)

![chart](https://example.com/chart.png)
```

`tests/fixtures/brain/research/glossary.md`:
```markdown
# Glossary

**AEO** — answer engine optimisation.
```

`tests/fixtures/brain/research/bad-frontmatter.md`:
```markdown
---
confidence: certain
---
# Bad frontmatter

Still readable.
```

- [ ] **Step 2: Config and global setup**

`playwright.config.ts` — add to `webServer.env`:
```ts
      HARBOUR_BRAIN_DIR: "./tests/fixtures/brain",
      HARBOUR_EDITOR_URL_TEMPLATE: "",
```

`tests/e2e/global-setup.ts` — before creating the session, insert a fixture passkey and link the session to it (use the file's existing imports plus `passkeys` from `@/lib/db/schema`):
```ts
  db.insert(passkeys)
    .values({
      id: "e2e-passkey",
      login: E2E_LOGIN,
      publicKey: Buffer.from([0]),
      counter: 0,
      transports: null,
      deviceLabel: "E2E browser",
      createdAt: new Date(),
      lastUsedAt: null,
    })
    .onConflictDoNothing()
    .run();
```
and change the session creation to `createSession(db, E2E_LOGIN, "e2e-passkey")`.

- [ ] **Step 3: Write `tests/e2e/brain.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("Second Brain start page, document, links and context rail", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("Content Security Policy")) cspErrors.push(m.text());
  });

  await page.goto("/brain");
  await expect(page.getByRole("heading", { level: 1, name: "Start here" })).toBeVisible();

  await page.locator(".brain-prose").getByRole("link", { name: "how-ai-engines-pick-sources" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How AI engines pick their sources" })).toBeVisible();
  await expect(page.getByText(/Stale — review was due 2026-02-01/)).toBeVisible();
  await expect(page.locator(".wikilink-broken", { hasText: "missing-note" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined();
  await expect(page.locator(".brain-prose img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "An external study" })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("complementary", { name: "Document context" }).getByRole("link", { name: "Signals that matter" })).toBeVisible();

  await page.locator(".brain-prose").getByRole("link", { name: "glossary", exact: true }).click();
  const rail = page.getByRole("complementary", { name: "Document context" });
  await expect(rail.getByRole("link", { name: "How AI engines pick their sources" })).toBeVisible();
  expect(cspErrors).toEqual([]);
});

test("invalid frontmatter is reported but the document still renders", async ({ page }) => {
  await page.goto("/brain/research/bad-frontmatter.md");
  await expect(page.getByRole("note")).toContainText("Frontmatter invalid");
  await expect(page.getByText("Still readable.")).toBeVisible();
});

test("search with Ctrl+K opens the chosen document", async ({ page }) => {
  await page.goto("/brain");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search the Second Brain" });
  await expect(input).toBeFocused();
  await input.fill("perplex");
  await expect(page.getByRole("option", { name: /How AI engines pick their sources/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/brain\/research\/geo\/how-ai-engines-pick-sources\.md$/);
});

test("path traversal and non-markdown paths are not found", async ({ page }) => {
  for (const path of ["/brain/..%2F..%2Fetc%2Fpasswd", "/brain/%2E%2E/README.md", "/brain/research/nope.md"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("sidebar links to the Second Brain", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Second Brain/ }).click();
  await expect(page).toHaveURL(/\/brain$/);
});

test.describe("app install assets", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("manifest and icons load without a session", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).name).toBe("Harbour");
    const icon = await request.get("/icons/192");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
  });
});
```

Append to `tests/e2e/shell.spec.ts`:
```ts
test("devices page marks this device", async ({ page }) => {
  await page.goto("/settings/devices");
  await expect(page.getByText("E2E browser")).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
});
```

- [ ] **Step 4: Run**

Run: `pnpm test:e2e`
Expected: all tests pass (existing 14 + 7 new + 1 devices). If a selector fails because of rendering details (e.g. wiki-link text vs. title), fix the selector, not the behaviour; if behaviour is wrong per the spec, fix the code in the owning task's files and note it.

- [ ] **Step 5: Gate and commit**

Run: `pnpm check && pnpm check:private` → PASS.
```bash
git add tests playwright.config.ts
git commit -m "test(e2e): Second Brain viewer, search, path safety, install assets and devices"
```

---

## Spec coverage (Phase 2a)

| Spec item | Task |
|---|---|
| A1 path guard, tree cap, frontmatter, setup screen | 2, 5 |
| A2 sanitised rendering, wiki-links (ambiguous, broken), external links, images, pills | 3, 5 |
| A3 layout, responsive tree/rail, start page, requireSession per page | 5 |
| A4 FTS5 search, watcher (debounced, single-flight), stale-index banner + reindex, ⌘K dialog | 4, 5, 6 |
| A5 "new" badge (tree dot + sidebar count) | 4, 5, 7 |
| A6 open in editor (configurable, hideable) | 5 |
| A7 installable app (manifest, icons, public assets, no service worker) | 8 |
| A8 devices: date+time, last used, this device, unique names, sign-out warning, tz/locale | 9 |
| A9 sidebar live link | 7 |
| AGENTS.md private-data check before commit/push | 1 |
| README kept current | 1, 5, 8 |
