import { execFileSync } from "node:child_process";
import { findPrivateData, type PrivateFinding } from "./private-data";

/** `git rev-list` arguments selecting one set of commits. */
export type RevRange = string[];

const ZERO_SHA = /^0+$/;

type PushLine = { localRef: string; localSha: string; remoteSha: string };

function parsePushLines(stdin: string): PushLine[] {
  return stdin
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [localRef, localSha, , remoteSha] = line.split(/\s+/);
      if (!localRef || !localSha || !remoteSha) {
        throw new Error(`Unexpected pre-push input: ${line}`);
      }
      return { localRef, localSha, remoteSha };
    });
}

/**
 * Commit ranges from git's pre-push stdin (`<local ref> <local sha> <remote ref> <remote sha>`
 * per line). Deletions are skipped; a new remote ref, or a remote sha this clone has never
 * fetched (`hasObject` false), scans everything not yet on origin.
 * Returns null when there is no input, so the caller can fall back to a default range.
 */
export function parsePushRanges(
  stdin: string,
  hasObject: (sha: string) => boolean = () => true,
): RevRange[] | null {
  const lines = parsePushLines(stdin);
  if (lines.length === 0) return null;
  return lines
    .filter(({ localSha }) => !ZERO_SHA.test(localSha))
    .map(({ localSha, remoteSha }) =>
      ZERO_SHA.test(remoteSha) || !hasObject(remoteSha)
        ? [localSha, "--not", "--remotes=origin"]
        : [`${remoteSha}..${localSha}`],
    );
}

export type PushedTag = { name: string; sha: string };

/** Tags being created or updated by the push (deletions skipped). */
export function pushedTags(stdin: string): PushedTag[] {
  return parsePushLines(stdin)
    .filter(
      ({ localRef, localSha }) => localRef.startsWith("refs/tags/") && !ZERO_SHA.test(localSha),
    )
    .map(({ localRef, localSha }) => ({
      name: localRef.slice("refs/tags/".length),
      sha: localSha,
    }));
}

function gitIn(cwd: string) {
  return (args: string[]) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
}

/** Whether this clone has the object (a remote sha may never have been fetched). */
export function hasObject(sha: string, cwd = process.cwd()): boolean {
  try {
    gitIn(cwd)(["cat-file", "-e", sha]);
    return true;
  } catch {
    return false;
  }
}

/** Tagger and message of annotated tags; lightweight tags carry no text of their own. */
export function scanTags(
  tags: PushedTag[],
  terms: string[],
  cwd = process.cwd(),
): PrivateFinding[] {
  const git = gitIn(cwd);
  return tags.flatMap(({ name, sha }) => {
    if (git(["cat-file", "-t", sha]).trim() !== "tag") return [];
    return findPrivateData({ path: `tag ${name}`, content: git(["cat-file", "tag", sha]) }, terms);
  });
}

/** Added lines per file in one commit's diff (headers excluded). */
function addedLinesByFile(diff: string): Map<string, string[]> {
  const files = new Map<string, string[]>();
  let path: string | null = null;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff ")) {
      inHeader = true;
      path = null;
    } else if (inHeader && line.startsWith("+++ ")) {
      const target = line.slice(4);
      path = target === "/dev/null" ? null : target.replace(/^b\//, "");
    } else if (line.startsWith("@@")) {
      inHeader = false;
    } else if (!inHeader && path && line.startsWith("+")) {
      const lines = files.get(path) ?? [];
      lines.push(line.slice(1));
      files.set(path, lines);
    }
  }
  return files;
}

/**
 * Secrets and owner terms in the author, committer, message and added lines of every commit in the
 * ranges — so a value added then removed before pushing is still caught.
 */
export function scanCommits(
  ranges: RevRange[],
  terms: string[],
  cwd = process.cwd(),
): PrivateFinding[] {
  const git = gitIn(cwd);
  const shas = new Set(
    ranges.flatMap((range) =>
      git(["rev-list", ...range, "--"])
        .split("\n")
        .filter((sha) => sha.length > 0),
    ),
  );
  return [...shas].flatMap((sha) => {
    const short = sha.slice(0, 7);
    const meta = git(["show", "-s", "--format=%an <%ae>%n%cn <%ce>%n%B", sha]);
    // A merge is diffed against its first parent, so lines added only in the merge are seen.
    const diff = git([
      "show",
      "--format=",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--diff-merges=first-parent",
      sha,
    ]);
    const contentFindings = [...addedLinesByFile(diff)].flatMap(([path, lines]) =>
      findPrivateData({ path, content: lines.join("\n") }, terms).map((finding) => ({
        ...finding,
        path: `commit ${short} ${path}`,
      })),
    );
    return [
      ...findPrivateData({ path: `commit ${short}`, content: meta }, terms),
      ...contentFindings,
    ];
  });
}
