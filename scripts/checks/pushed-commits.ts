import { execFileSync } from "node:child_process";
import { findPrivateData, type PrivateFinding } from "./private-data";

/** `git rev-list` arguments selecting one set of commits. */
export type RevRange = string[];

const ZERO_SHA = /^0+$/;

/**
 * Commit ranges from git's pre-push stdin (`<local ref> <local sha> <remote ref> <remote sha>`
 * per line). Deletions are skipped; a new remote branch scans everything not yet on origin.
 * Returns null when there is no input, so the caller can fall back to a default range.
 */
export function parsePushRanges(stdin: string): RevRange[] | null {
  const lines = stdin
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  const ranges: RevRange[] = [];
  for (const line of lines) {
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || !remoteSha) throw new Error(`Unexpected pre-push input: ${line}`);
    if (ZERO_SHA.test(localSha)) continue;
    ranges.push(
      ZERO_SHA.test(remoteSha)
        ? [localSha, "--not", "--remotes=origin"]
        : [`${remoteSha}..${localSha}`],
    );
  }
  return ranges;
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
 * Secrets and owner terms in the author, message and added lines of every commit in the
 * ranges — so a value added then removed before pushing is still caught.
 */
export function scanCommits(
  ranges: RevRange[],
  terms: string[],
  cwd = process.cwd(),
): PrivateFinding[] {
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  const shas = new Set(
    ranges.flatMap((range) =>
      git(["rev-list", ...range, "--"])
        .split("\n")
        .filter((sha) => sha.length > 0),
    ),
  );
  return [...shas].flatMap((sha) => {
    const short = sha.slice(0, 7);
    const meta = git(["show", "-s", "--format=%an <%ae>%n%B", sha]);
    const diff = git(["show", "--format=", "--unified=0", "--no-color", "--no-ext-diff", sha]);
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
