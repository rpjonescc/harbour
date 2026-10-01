import { execFileSync } from "node:child_process";
import { posix } from "node:path";

export type Change = { path: string; untracked: boolean };
export type AllowedPaths = { prefixes: string[]; exact: string[] };

const GIT_TIMEOUT_MS = 60_000;

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Uncommitted changes (including untracked files), brain-relative. */
export function changedPaths(root: string): Change[] {
  const out = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const entries = out.split("\0").filter(Boolean);
  const changes: Change[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    const code = entry.slice(0, 2);
    changes.push({ path: entry.slice(3), untracked: code === "??" });
    if (code.startsWith("R") || code.startsWith("C")) i++; // skip the rename source
  }
  return changes;
}

/** Inside an allowed prefix as markdown, or one of the exact allowed paths. */
export function isAllowedChange(path: string, allowed: AllowedPaths): boolean {
  if (posix.normalize(path) !== path || path.startsWith("/")) return false;
  if (allowed.exact.includes(path)) return true;
  return path.endsWith(".md") && allowed.prefixes.some((prefix) => path.startsWith(prefix));
}

export function partitionChanges(changes: Change[], allowed: AllowedPaths) {
  return {
    allowed: changes.filter((c) => isAllowedChange(c.path, allowed)),
    rejected: changes.filter((c) => !isAllowedChange(c.path, allowed)),
  };
}

/** Puts changed files back to HEAD; deletes untracked ones. */
export function restoreChanges(root: string, changes: Change[]): void {
  const tracked = changes.filter((c) => !c.untracked).map((c) => c.path);
  const untracked = changes.filter((c) => c.untracked).map((c) => c.path);
  if (tracked.length)
    git(root, ["restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]);
  if (untracked.length) git(root, ["clean", "-f", "-q", "--", ...untracked]);
}

/** Commits exactly these paths; returns the new commit sha. */
export function commitChanges(root: string, paths: string[], message: string): string {
  git(root, ["add", "--", ...paths]);
  git(root, ["commit", "-q", "-m", message, "--", ...paths]);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function pushBrain(root: string): { ok: true } | { ok: false; error: string } {
  try {
    git(root, ["push", "-q"]);
    return { ok: true };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    return { ok: false, error: (stderr || (error as Error).message).trim().slice(0, 300) };
  }
}

/** Commits not yet on the upstream, or null when there is no upstream. */
export function unpushedCount(root: string): number | null {
  try {
    return Number(git(root, ["rev-list", "--count", "@{upstream}..HEAD"]).trim());
  } catch {
    return null;
  }
}
