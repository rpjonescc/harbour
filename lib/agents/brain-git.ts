import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { posix } from "node:path";
import { isAgentChange, isOutsideBrain, type Touched } from "./attribution";
import { type FileStat, gitMetaHashes, isRestorable, nestedGitDirs, statOf } from "./brain-git-fs";
import { git } from "./git-command";

/** `pair` links both halves of a rename; `ignored` marks a new ignored file (never allowed). */
export type Change = { path: string; untracked: boolean; pair?: string; ignored?: true };
export type AllowedPaths = { prefixes: string[]; exact: string[] };
/**
 * What existed before an agent run and belongs to the owner: ignored files, nested `.git`
 * entries, hashes of git metadata, and the bytes of `.git/HEAD`, `.git/config` and `.git/info/*`.
 */
export type RunSnapshot = {
  ignored: Map<string, FileStat>;
  nestedGit: Map<string, number>;
  gitMeta: Map<string, string>;
  gitRestore: Map<string, Buffer>;
};
const MAX_RESTORE_BYTES = 1024 * 1024;

/**
 * Throws unless `root` is the top level of its own git repository. Git run in a subfolder of
 * another repository (the default `./brain` sits inside the Harbour checkout) would commit and
 * push that repository instead.
 */
export function assertBrainRepoRoot(root: string): void {
  const prefix = "HARBOUR_BRAIN_DIR must be the root of its own git repository";
  let toplevel: string;
  try {
    // Unpinned and read-only on purpose: discovery reveals an enclosing repository to name it.
    toplevel = git(root, ["rev-parse", "--show-toplevel"], false).trim();
  } catch {
    throw new Error(`${prefix} (${root} is not a git repository)`);
  }
  if (realpathSync(toplevel) !== realpathSync(root)) {
    throw new Error(`${prefix} (it is inside ${toplevel})`);
  }
}

/** Tracked/untracked changes from `git status` (never ignored files); a rename yields both halves. */
export function statusChanges(root: string): Change[] {
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

/** The owner's uncommitted changes (never ignored files), for owner-notes autosave. */
export function ownerChanges(root: string): Change[] {
  return statusChanges(root);
}

/** Records what the owner has before an agent run. Throws if the brain has uncommitted changes. */
export function snapshotRun(root: string): RunSnapshot {
  if (ownerChanges(root).length) throw new Error("brain has uncommitted changes");
  const ignored = new Map<string, FileStat>();
  for (const path of ignoredFiles(root)) {
    const stat = statOf(root, path);
    if (stat) ignored.set(path, stat);
  }
  const nestedGit = new Map<string, number>();
  for (const path of nestedGitDirs(root, [""])) {
    const stat = statOf(root, path);
    if (stat) nestedGit.set(path, stat.ino);
  }
  const gitMeta = gitMetaHashes(root);
  const gitRestore = new Map<string, Buffer>();
  let total = 0;
  for (const path of gitMeta.keys()) {
    if (!isRestorable(path)) continue;
    const data = readFileSync(posix.join(root, path));
    total += data.length;
    if (total > MAX_RESTORE_BYTES) throw new Error("git metadata too large to snapshot");
    gitRestore.set(path, data);
  }
  return { ignored, nestedGit, gitMeta, gitRestore };
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

/** Ignored files that did not exist before the run (and are not in `seen`). */
export function newIgnored(root: string, snapshot: RunSnapshot, seen: Set<string>): Change[] {
  return ignoredFiles(root)
    .filter((path) => !snapshot.ignored.has(path) && !seen.has(path))
    .map((path) => ({ path, untracked: true, ignored: true as const }));
}

/** Nested `.git` entries that were not there (with the same inode) before the run. */
export function newNestedGit(root: string, snapshot: RunSnapshot, starts: string[]): string[] {
  return nestedGitDirs(root, starts).filter(
    (path) => snapshot.nestedGit.get(path) !== statOf(root, path)?.ino,
  );
}

/** Git metadata paths that were added, removed or changed since the snapshot. */
function gitTamperedPaths(root: string, snapshot: RunSnapshot): string[] {
  const now = gitMetaHashes(root);
  const keys = new Set([...snapshot.gitMeta.keys(), ...now.keys()]);
  return [...keys].filter((k) => snapshot.gitMeta.get(k) !== now.get(k)).sort();
}

/**
 * Everything the agent changed, split into allowed and rejected (symlinks rejected; a rename is
 * allowed only when both halves are), plus pre-existing ignored files that were edited or deleted.
 * Status changes the agent did not touch are the owner's: reported, never gated. New ignored
 * files, nested repos and git metadata are always checked.
 */
export function inspectRun(
  root: string,
  snapshot: RunSnapshot,
  allowed: AllowedPaths,
  touched: Touched,
): {
  allowed: Change[];
  rejected: Change[];
  owner: Change[];
  tampered: string[];
  gitTampered: string[];
} {
  const gitTampered = gitTamperedPaths(root, snapshot);
  let status: Change[];
  try {
    status = statusChanges(root);
  } catch (error) {
    // Tampered metadata (e.g. a broken HEAD) can stop git itself; report the tampering.
    if (gitTampered.length > 0)
      return { allowed: [], rejected: [], owner: [], tampered: [], gitTampered };
    throw error;
  }
  const changes = status.filter((c) => isAgentChange(c, touched));
  const owner = status.filter((c) => !isAgentChange(c, touched));
  if (touched !== "all") {
    for (const path of touched) if (isOutsideBrain(path)) changes.push({ path, untracked: true });
  }
  const seen = new Set(status.map((c) => c.path));
  changes.push(...newIgnored(root, snapshot, seen));
  for (const path of newNestedGit(
    root,
    snapshot,
    allowed.prefixes.map((p) => p.slice(0, -1)),
  )) {
    if (!changes.some((c) => c.path === path)) changes.push({ path, untracked: true });
  }
  const ok = (c: Change) =>
    !c.ignored &&
    isAllowedChange(c.path, allowed) &&
    (c.pair === undefined || isAllowedChange(c.pair, allowed)) &&
    !isSymlink(root, c.path);
  return {
    allowed: changes.filter(ok),
    rejected: changes.filter((c) => !ok(c)),
    owner,
    tampered: tamperedIgnored(root, snapshot),
    gitTampered,
  };
}

/** Pre-existing ignored files that were edited or deleted since the snapshot. */
function tamperedIgnored(root: string, snapshot: RunSnapshot): string[] {
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
  return tampered;
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
  return text.replace(/:\/\/[^\s/]*@/g, "://***@");
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

/** Commits not yet on the upstream, or null when they could not be counted (no upstream, git failed). */
export function unpushedCount(root: string): number | null {
  try {
    return Number(git(root, ["rev-list", "--count", "@{upstream}..HEAD"]).trim());
  } catch {
    return null;
  }
}
