import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePushRanges, pushedTags, scanCommits, scanTags } from "./pushed-commits";

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

  it("returns one range per pushed ref", () => {
    const other = "c".repeat(40);
    const stdin = [
      `refs/heads/main ${LOCAL} refs/heads/main ${REMOTE}`,
      `refs/heads/side ${other} refs/heads/side ${ZERO}`,
    ].join("\n");
    expect(parsePushRanges(stdin)).toEqual([
      [`${REMOTE}..${LOCAL}`],
      [other, "--not", "--remotes=origin"],
    ]);
  });

  it("falls back to everything not on origin when the remote sha is unknown locally", () => {
    const known = (sha: string) => sha !== REMOTE;
    expect(parsePushRanges(`refs/heads/main ${LOCAL} refs/heads/main ${REMOTE}\n`, known)).toEqual([
      [LOCAL, "--not", "--remotes=origin"],
    ]);
  });

  it("returns null for empty input so the caller falls back", () => {
    expect(parsePushRanges("")).toBeNull();
    expect(parsePushRanges("  \n")).toBeNull();
  });
});

describe("pushedTags", () => {
  it("lists pushed tag refs and skips branches and deletions", () => {
    const stdin = [
      `refs/heads/main ${LOCAL} refs/heads/main ${REMOTE}`,
      `refs/tags/v1 ${LOCAL} refs/tags/v1 ${ZERO}`,
      `(delete) ${ZERO} refs/tags/old ${REMOTE}`,
    ].join("\n");
    expect(pushedTags(stdin)).toEqual([{ name: "v1", sha: LOCAL }]);
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
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Sam Sample");
    git("config", "user.email", "sam@example.com");
    writeFileSync(join(root, "base.ts"), "export const base = 1;\n");
    git("add", ".");
    commit("chore: base");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reports a secret added in one commit and removed in the next", () => {
    const base = git("rev-parse", "HEAD");
    const token = `ghp_${"a".repeat(36)}`;
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

  it("scans the committer as well as the author", () => {
    const base = git("rev-parse", "HEAD");
    execFileSync(
      "git",
      ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "chore: x"],
      {
        cwd: root,
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: "Jane Example",
          GIT_COMMITTER_EMAIL: "c@example.com",
        },
      },
    );
    expect(scanCommits([[`${base}..HEAD`]], ["Jane Example"], root).map((f) => f.label)).toEqual([
      'term "Jane Example"',
    ]);
  });

  it("scans every ref's commits and a secret added only in a merge commit", () => {
    const base = git("rev-parse", "HEAD");
    const token = `ghp_${"a".repeat(36)}`;
    git("checkout", "-q", "-b", "side");
    writeFileSync(join(root, "side.ts"), "export const side = 1;\n");
    git("add", ".");
    commit("feat: side");
    git("checkout", "-q", "-");
    git("merge", "-q", "--no-ff", "--no-commit", "side");
    writeFileSync(join(root, "merge.ts"), `const key = "${token}";\n`);
    git("add", ".");
    commit("merge side");
    const merge = git("rev-parse", "--short=7", "HEAD");
    git("checkout", "-q", "-b", "other", base);
    writeFileSync(join(root, "other.ts"), `const key = "${token}";\n`);
    git("add", ".");
    commit("feat: other");
    const other = git("rev-parse", "--short=7", "HEAD");

    const paths = scanCommits([[`${base}..main`], [`${base}..other`]], [], root).map((f) => f.path);
    expect(paths.sort()).toEqual([`commit ${merge} merge.ts`, `commit ${other} other.ts`].sort());
  });
});

describe("scanTags", () => {
  it("scans annotated tag messages and ignores lightweight tags", () => {
    const root = mkdtempSync(join(tmpdir(), "harbour-tags-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    try {
      git("init", "-q");
      git("config", "user.name", "Sam Sample");
      git("config", "user.email", "sam@example.com");
      git("-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "base");
      git("-c", "tag.gpgsign=false", "tag", "-a", "v1", "-m", "Release for Acme");
      git("tag", "light");
      const tags = [
        { name: "v1", sha: git("rev-parse", "v1") },
        { name: "light", sha: git("rev-parse", "light") },
      ];
      expect(scanTags(tags, ["Acme"], root)).toEqual([
        { path: "tag v1", line: 6, label: 'term "Acme"' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
