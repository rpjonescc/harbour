import { appendFileSync, lstatSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { posix, resolve } from "node:path";
import {
  type FileStat,
  gitMetaHashes,
  isRestorable,
  nestedGitDirs,
  prepareQuarantineDir,
  quarantine,
  restoreGitMetadata,
  statOf,
} from "./brain-git-fs";
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

const MAX_DISCARD_ROUNDS = 3;

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

function newIgnored(root: string, snapshot: RunSnapshot, seen: Set<string>): Change[] {
  return ignoredFiles(root)
    .filter((path) => !snapshot.ignored.has(path) && !seen.has(path))
    .map((path) => ({ path, untracked: true, ignored: true as const }));
}

/** Nested `.git` entries that were not there (with the same inode) before the run. */
function newNestedGit(root: string, snapshot: RunSnapshot, starts: string[]): string[] {
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
 * Everything the run changed, split into allowed and rejected (symlinks rejected; a rename is
 * allowed only when both halves are), plus pre-existing ignored files that were edited or deleted.
 */
export function inspectRun(
  root: string,
  snapshot: RunSnapshot,
  allowed: AllowedPaths,
): { allowed: Change[]; rejected: Change[]; tampered: string[]; gitTampered: string[] } {
  const gitTampered = gitTamperedPaths(root, snapshot);
  let changes: Change[];
  try {
    changes = statusChanges(root);
  } catch (error) {
    // Tampered metadata (e.g. a broken HEAD) can stop git itself; report the tampering.
    if (gitTampered.length > 0) return { allowed: [], rejected: [], tampered: [], gitTampered };
    throw error;
  }
  const seen = new Set(changes.map((c) => c.path));
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
    gitTampered,
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
 * deleted, `.git/config` and `.git/info/*` restored. Before anything is touched, every changed
 * file's current content is copied to `quarantineDir` (outside the brain) with a MANIFEST.txt.
 * Snapshot entries are never deleted. Re-scans and throws if anything remains.
 */
export function discardRun(
  root: string,
  snapshot: RunSnapshot,
  quarantineDir: string,
): { quarantined: string[] } {
  const dirAbs = prepareQuarantineDir(root, quarantineDir);
  const done = new Set<string>();
  const notes: string[] = [];
  const removeNestedGit = () => {
    const nested = newNestedGit(root, snapshot, [""]);
    quarantine(
      root,
      dirAbs,
      nested.map((path) => ({ path })),
      notes,
      done,
    );
    for (const path of nested) {
      notes.push(`${path}: nested .git removed`);
      rmSync(posix.join(root, path), { recursive: true, force: true });
    }
  };
  const flush = () => {
    if (!notes.length) return;
    appendFileSync(resolve(dirAbs, "MANIFEST.txt"), `${notes.join("\n")}\n`);
    notes.length = 0;
  };
  // Git metadata first, so the git commands below run against the owner's repository.
  restoreGitMetadata(root, snapshot.gitMeta, snapshot.gitRestore, notes);
  flush();
  let pending = runChanges(root, snapshot);
  for (let round = 0; round < MAX_DISCARD_ROUNDS; round++) {
    quarantine(root, dirAbs, pending, notes, done);
    flush();
    removeNestedGit();
    restoreGitMetadata(root, snapshot.gitMeta, snapshot.gitRestore, notes);
    flush();
    if (pending.length) revert(root, pending);
    pending = runChanges(root, snapshot);
    if (!pending.length && !newNestedGit(root, snapshot, [""]).length)
      return { quarantined: [...done] };
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

/** Commits not yet on the upstream, or null when there is no upstream. */
export function unpushedCount(root: string): number | null {
  try {
    return Number(git(root, ["rev-list", "--count", "@{upstream}..HEAD"]).trim());
  } catch {
    return null;
  }
}
