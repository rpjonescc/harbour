import { execFileSync } from "node:child_process";
import { type Dirent, lstatSync, readdirSync, rmSync } from "node:fs";
import { posix } from "node:path";

/** `pair` links both halves of a rename: the destination and the deleted source. */
export type Change = { path: string; untracked: boolean; pair?: string };
export type AllowedPaths = { prefixes: string[]; exact: string[] };
type FileStat = { size: number; mtimeMs: number; ino: number };
/** Ignored files that existed before an agent run; they belong to the owner. */
export type RunSnapshot = { ignored: Map<string, FileStat> };

const GIT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024;
const MAX_DISCARD_ROUNDS = 3;

function gitEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

/**
 * Every gate git call is hardened: literal pathspecs (file names are never magic), no fsmonitor
 * or hook execution from repo config, no system config, no prompts.
 */
function git(root: string, args: string[]): string {
  return execFileSync(
    "git",
    [
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: gitEnv() as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

/** Tracked/untracked changes from `git status` (never ignored files); a rename yields both halves. */
function statusChanges(root: string): Change[] {
  const out = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const entries = out.split("\0").filter(Boolean);
  const changes: Change[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code.startsWith("R") || code.startsWith("C")) {
      const source = entries[++i] ?? "";
      changes.push({ path, untracked: false, pair: source });
      if (code.startsWith("R")) changes.push({ path: source, untracked: false, pair: path });
    } else {
      changes.push({ path, untracked: code === "??" });
    }
  }
  return changes;
}

function ignoredFiles(root: string): string[] {
  return git(root, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
}

function statOf(root: string, path: string): FileStat | null {
  try {
    const st = lstatSync(posix.join(root, path));
    return { size: st.size, mtimeMs: st.mtimeMs, ino: st.ino };
  } catch {
    return null;
  }
}

/** The owner's uncommitted changes (never ignored files), for owner-notes autosave. */
export function ownerChanges(root: string): Change[] {
  return statusChanges(root);
}

/** Records the owner's ignored files before an agent run. */
export function snapshotRun(root: string): RunSnapshot {
  const ignored = new Map<string, FileStat>();
  for (const path of ignoredFiles(root)) {
    const stat = statOf(root, path);
    if (stat) ignored.set(path, stat);
  }
  return { ignored };
}

/** Inside an allowed prefix as markdown, or one of the exact allowed paths. */
export function isAllowedChange(path: string, allowed: AllowedPaths): boolean {
  for (const prefix of allowed.prefixes) {
    if (!prefix.endsWith("/")) throw new Error(`allowed prefix must end with "/": ${prefix}`);
  }
  if (posix.normalize(path) !== path || path.startsWith("/")) return false;
  if (path.split("/").includes(".git")) return false;
  if (allowed.exact.includes(path)) return true;
  return path.endsWith(".md") && allowed.prefixes.some((prefix) => path.startsWith(prefix));
}

function isSymlink(root: string, path: string): boolean {
  try {
    return lstatSync(posix.join(root, path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Nested `.git` entries under `starts`, found by an lstat walk (never follows symlinks). */
function nestedGitDirs(root: string, starts: string[]): string[] {
  const found: string[] = [];
  const walk = (rel: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(posix.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = rel ? posix.join(rel, entry.name) : entry.name;
      if (entry.name === ".git") {
        if (rel) found.push(child);
      } else if (entry.isDirectory()) walk(child);
    }
  };
  for (const start of starts) walk(start);
  return found;
}

function newIgnored(root: string, snapshot: RunSnapshot, seen: Set<string>): Change[] {
  return ignoredFiles(root)
    .filter((path) => !snapshot.ignored.has(path) && !seen.has(path))
    .map((path) => ({ path, untracked: true }));
}

/**
 * Everything the run changed, split into allowed and rejected (symlinks rejected; a rename is
 * allowed only when both halves are), plus pre-existing ignored files that were edited or deleted.
 */
export function inspectRun(
  root: string,
  snapshot: RunSnapshot,
  allowed: AllowedPaths,
): { allowed: Change[]; rejected: Change[]; tampered: string[] } {
  const changes = statusChanges(root);
  const seen = new Set(changes.map((c) => c.path));
  changes.push(...newIgnored(root, snapshot, seen));
  for (const path of nestedGitDirs(
    root,
    allowed.prefixes.map((p) => p.slice(0, -1)),
  )) {
    if (!changes.some((c) => c.path === path)) changes.push({ path, untracked: true });
  }
  const ok = (c: Change) =>
    isAllowedChange(c.path, allowed) &&
    (c.pair === undefined || isAllowedChange(c.pair, allowed)) &&
    !isSymlink(root, c.path);
  const tampered: string[] = [];
  for (const [path, before] of snapshot.ignored) {
    const now = statOf(root, path);
    if (
      !now ||
      now.size !== before.size ||
      now.mtimeMs !== before.mtimeMs ||
      now.ino !== before.ino
    ) {
      tampered.push(path);
    }
  }
  return {
    allowed: changes.filter(ok),
    rejected: changes.filter((c) => !ok(c)),
    tampered,
  };
}

function inHead(root: string, path: string): boolean {
  try {
    git(root, ["cat-file", "-e", `HEAD:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function revert(root: string, changes: Change[]): void {
  const tracked = changes.filter((c) => !c.untracked && inHead(root, c.path)).map((c) => c.path);
  const gone = changes.filter((c) => !tracked.includes(c.path)).map((c) => c.path);
  if (tracked.length)
    git(root, ["restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]);
  if (gone.length) {
    git(root, ["rm", "-r", "-f", "-q", "--cached", "--ignore-unmatch", "--", ...gone]);
    git(root, ["clean", "-ffdxq", "--", ...gone]);
  }
}

function runChanges(root: string, snapshot: RunSnapshot): Change[] {
  const changes = statusChanges(root).filter((c) => !snapshot.ignored.has(c.path));
  const seen = new Set(changes.map((c) => c.path));
  return [...changes, ...newIgnored(root, snapshot, seen)];
}

/**
 * Throws the run away: tracked changes back to HEAD, unstaged, untracked and new ignored files
 * deleted. Files in the snapshot are never deleted. Re-scans and throws if anything remains.
 */
export function discardRun(root: string, snapshot: RunSnapshot): void {
  const removeNestedGit = () => {
    for (const path of nestedGitDirs(root, [""]))
      rmSync(posix.join(root, path), { recursive: true, force: true });
  };
  removeNestedGit();
  let pending = runChanges(root, snapshot);
  for (let round = 0; round < MAX_DISCARD_ROUNDS; round++) {
    if (pending.length) revert(root, pending);
    removeNestedGit();
    pending = runChanges(root, snapshot);
    if (!pending.length) return;
  }
  throw new Error(`could not restore: ${pending.map((c) => c.path).join(", ")}`);
}

/** Commits exactly these paths; returns the new commit sha. */
export function commitChanges(root: string, paths: string[], message: string): string {
  if (!paths.length) throw new Error("nothing to commit");
  git(root, ["add", "--", ...paths]);
  git(root, ["commit", "-q", "-m", message, "--", ...paths]);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

/** Removes `://user:pass@` credentials from text. */
export function redactCredentials(text: string): string {
  return text.replace(/:\/\/[^@\s/]*@/g, "://");
}

export function pushBrain(root: string): { ok: true } | { ok: false; error: string } {
  try {
    git(root, ["push", "-q"]);
    return { ok: true };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    return {
      ok: false,
      error: redactCredentials((stderr || (error as Error).message).trim()).slice(0, 300),
    };
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
