import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { posix } from "node:path";

/** `pair` links both halves of a rename: the destination and the deleted source. */
export type Change = { path: string; untracked: boolean; pair?: string };
export type AllowedPaths = { prefixes: string[]; exact: string[] };

const GIT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024;
const MAX_RESTORE_ROUNDS = 3;

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
 * or hook execution from repo config, no global excludes, no system config, no prompts.
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
      "-c",
      "core.excludesFile=/dev/null",
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

function ignoredFiles(root: string): string[] {
  return git(root, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
}

/** Files git currently ignores; take it before a run so pre-existing ignored files are not blamed on the agent. */
export function snapshotIgnored(root: string): Set<string> {
  return new Set(ignoredFiles(root));
}

/**
 * Uncommitted changes (including untracked and new ignored files), brain-relative. Files in
 * `baseline` (ignored before the run) are skipped. A rename yields both halves, linked by `pair`.
 */
export function changedPaths(root: string, baseline?: Set<string>): Change[] {
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
  const seen = new Set(changes.map((c) => c.path));
  for (const path of ignoredFiles(root)) {
    if (baseline?.has(path) || seen.has(path)) continue;
    changes.push({ path, untracked: true });
  }
  return changes;
}

/** Inside an allowed prefix as markdown, or one of the exact allowed paths. */
export function isAllowedChange(path: string, allowed: AllowedPaths): boolean {
  for (const prefix of allowed.prefixes) {
    if (!prefix.endsWith("/")) throw new Error(`allowed prefix must end with "/": ${prefix}`);
  }
  if (posix.normalize(path) !== path || path.startsWith("/")) return false;
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

/** Splits out changes that are symlinks: they could point outside the brain whatever their name. */
export function rejectSymlinks(root: string, changes: Change[]) {
  return {
    ok: changes.filter((c) => !isSymlink(root, c.path)),
    symlinks: changes.filter((c) => isSymlink(root, c.path)),
  };
}

/** A rename is allowed only when both its destination and its source are allowed. */
export function partitionChanges(changes: Change[], allowed: AllowedPaths, root?: string) {
  const ok = (c: Change) =>
    isAllowedChange(c.path, allowed) &&
    (c.pair === undefined || isAllowedChange(c.pair, allowed)) &&
    (root === undefined || !isSymlink(root, c.path));
  return { allowed: changes.filter(ok), rejected: changes.filter((c) => !ok(c)) };
}

function inHead(root: string, path: string): boolean {
  try {
    git(root, ["cat-file", "-e", `HEAD:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function restoreOnce(root: string, changes: Change[]): void {
  const tracked = changes.filter((c) => !c.untracked && inHead(root, c.path)).map((c) => c.path);
  const gone = changes.filter((c) => c.untracked || !tracked.includes(c.path)).map((c) => c.path);
  if (tracked.length)
    git(root, ["restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]);
  if (gone.length) {
    git(root, ["rm", "-r", "-f", "-q", "--cached", "--ignore-unmatch", "--", ...gone]);
    git(root, ["clean", "-ffdxq", "--", ...gone]);
  }
}

/**
 * Puts changed files back to HEAD; deletes untracked and ignored ones. Re-scans afterwards and
 * throws if a rejected path survives or a new out-of-scope change appeared.
 */
export function restoreChanges(
  root: string,
  changes: Change[],
  opts: { baseline?: Set<string>; allowed?: AllowedPaths } = {},
): void {
  const rejected = new Set(changes.map((c) => c.path));
  let pending = changes;
  for (let round = 0; round < MAX_RESTORE_ROUNDS; round++) {
    if (pending.length) restoreOnce(root, pending);
    pending = changedPaths(root, opts.baseline).filter(
      (c) =>
        rejected.has(c.path) ||
        (opts.allowed !== undefined && !partitionChanges([c], opts.allowed, root).allowed.length),
    );
    if (!pending.length) return;
    for (const c of pending) rejected.add(c.path);
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
