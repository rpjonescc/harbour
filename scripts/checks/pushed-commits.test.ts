import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePushRanges, scanCommits } from "./pushed-commits";

const ZERO = "0".repeat(40);
const LOCAL = "a".repeat(40);
const REMOTE = "b".repeat(40);

describe("parsePushRanges", () => {
  it("uses remote..local for a normal update", () => {
    expect(parsePushRanges(`refs/heads/main ${LOCAL} refs/heads/main ${REMOTE}\n`)).toEqual([
      [`${REMOTE}..${LOCAL}`],
    ]);
  });

  it("scans everything not on origin for a new branch", () => {
    expect(parsePushRanges(`refs/heads/new ${LOCAL} refs/heads/new ${ZERO}\n`)).toEqual([
      [LOCAL, "--not", "--remotes=origin"],
    ]);
  });

  it("skips branch deletions", () => {
    expect(parsePushRanges(`(delete) ${ZERO} refs/heads/old ${REMOTE}\n`)).toEqual([]);
  });

  it("returns null for empty input so the caller falls back", () => {
    expect(parsePushRanges("")).toBeNull();
    expect(parsePushRanges("  \n")).toBeNull();
  });
});

describe("scanCommits", () => {
  let root = "";
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = (message: string, author = "Sam Sample <sam@example.com>") =>
    git("-c", "commit.gpgsign=false", "commit", "-q", "--author", author, "-m", message);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "harbour-commits-"));
    git("init", "-q");
    git("config", "user.name", "Sam Sample");
    git("config", "user.email", "sam@example.com");
    writeFileSync(join(root, "base.ts"), "export const base = 1;\n");
    git("add", ".");
    commit("chore: base");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reports a secret added in one commit and removed in the next", () => {
    const base = git("rev-parse", "HEAD");
    const token = "ghp_" + "a".repeat(36);
    writeFileSync(join(root, "leak.ts"), `const key = "${token}";\n`);
    git("add", ".");
    commit("feat: add key");
    const added = git("rev-parse", "--short=7", "HEAD");
    writeFileSync(join(root, "leak.ts"), "const key = 'clean';\n");
    git("add", ".");
    commit("fix: remove key");

    const findings = scanCommits([[`${base}..HEAD`]], [], root);
    expect(findings).toEqual([{ path: `commit ${added} leak.ts`, line: 1, label: "GitHub token" }]);
  });

  it("still scans author details and messages", () => {
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, "x.ts"), "export const x = 1;\n");
    git("add", ".");
    commit("feat: for Acme", "Jane Example <jane@example.org>");

    const labels = scanCommits([[`${base}..HEAD`]], ["Acme", "Jane Example"], root).map(
      (f) => f.label,
    );
    expect(labels).toEqual(['term "Jane Example"', 'term "Acme"']);
  });

  it("ignores generated files in commit content", () => {
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, "pnpm-lock.yaml"), "Acme\n");
    git("add", ".");
    commit("chore: lock");
    expect(scanCommits([[`${base}..HEAD`]], ["Acme"], root)).toEqual([]);
  });
});
