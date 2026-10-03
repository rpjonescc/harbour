import { createHash } from "node:crypto";
import {
  constants,
  copyFileSync,
  type Dirent,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { posix, resolve, sep } from "node:path";

export type FileStat = { size: number; mtimeMs: number; ino: number };

/** How deep and how wide a walk of the brain may go before it is refused. */
export type WalkLimits = { depth: number; entries: number };

// A brain past these is refused with an error, never checked in part: a walk that stopped
// quietly would let a nested .git or a changed file go unseen.
export const WALK_LIMITS: WalkLimits = { depth: 64, entries: 100_000 };

/** A per-walk counter that throws once a folder is too deep or too many entries were seen. */
function walkBudget(limits: WalkLimits) {
  let seen = 0;
  return {
    enter(depth: number): void {
      if (depth > limits.depth) throw new Error("Folders are nested too deeply to check");
    },
    count(): void {
      seen += 1;
      if (seen > limits.entries) throw new Error("Too many files and folders to check");
    },
  };
}

export function statOf(root: string, path: string): FileStat | null {
  try {
    const st = lstatSync(posix.join(root, path));
    return { size: st.size, mtimeMs: st.mtimeMs, ino: st.ino };
  } catch {
    return null;
  }
}

function sha(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Git metadata files (relative paths) that decide what git does with the brain. */
export function gitMetaPaths(root: string, limits = WALK_LIMITS): string[] {
  const out = [".git/config", ".git/HEAD", ".git/packed-refs", ".gitmodules"];
  const budget = walkBudget(limits);
  const walk = (rel: string, depth: number) => {
    budget.enter(depth);
    let entries: Dirent[];
    try {
      if (!lstatSync(posix.join(root, rel)).isDirectory()) return; // not a dir, or a symlink
      entries = readdirSync(posix.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      budget.count();
      const child = posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(child, depth + 1);
      else out.push(child);
    }
  };
  walk(".git/info", 0);
  walk(".git/refs", 0);
  return out;
}

export function hashOf(root: string, path: string): string | null {
  try {
    const full = posix.join(root, path);
    return lstatSync(full).isSymbolicLink()
      ? sha(`symlink:${readlinkSync(full)}`)
      : sha(readFileSync(full));
  } catch {
    return null;
  }
}

export function gitMetaHashes(root: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const path of gitMetaPaths(root)) {
    const hash = hashOf(root, path);
    if (hash) hashes.set(path, hash);
  }
  return hashes;
}

export function isRestorable(path: string): boolean {
  return path === ".git/HEAD" || path === ".git/config" || path.startsWith(".git/info/");
}

/**
 * Nested `.git` entries under `starts`, found by an lstat walk (never follows symlinks). Throws
 * past `limits` rather than return a partial answer.
 */
export function nestedGitDirs(root: string, starts: string[], limits = WALK_LIMITS): string[] {
  const found: string[] = [];
  const budget = walkBudget(limits);
  const walk = (rel: string, depth: number) => {
    budget.enter(depth);
    let entries: Dirent[];
    try {
      entries = readdirSync(posix.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      budget.count();
      const child = rel ? posix.join(rel, entry.name) : entry.name;
      if (entry.name === ".git") {
        if (rel) found.push(child);
      } else if (entry.isDirectory()) walk(child, depth + 1);
    }
  };
  for (const start of starts) walk(start, 0);
  return found;
}

const MAX_QUARANTINE_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Validates and creates the quarantine directory: it must be outside the brain (real paths
 * compared, after creation) and empty, so a copy can never overwrite earlier quarantined data.
 */
export function prepareQuarantineDir(root: string, dir: string): string {
  const rootAbs = resolve(root);
  const dirAbs = resolve(dir);
  const inside = (d: string, r: string) => d === r || d.startsWith(r + sep);
  if (inside(dirAbs, rootAbs)) throw new Error("quarantine directory must be outside the brain");
  mkdirSync(dirAbs, { recursive: true });
  if (inside(realpathSync(dirAbs), realpathSync(rootAbs))) {
    rmSync(dirAbs, { recursive: true, force: true });
    throw new Error("quarantine directory must be outside the brain");
  }
  if (readdirSync(dirAbs).length) throw new Error("quarantine directory must be empty");
  return dirAbs;
}

/**
 * Copies each change's current content (files, and directories recursively including `.git`) into
 * the quarantine and notes every entry. Throws, before anything is deleted, if a file exceeds the
 * cap or a folder is past `limits`. Symlinks and special files are noted, not copied. Files in
 * `done` are skipped.
 */
export function quarantine(
  root: string,
  dir: string,
  changes: { path: string }[],
  notes: string[],
  done: Set<string>,
  limits = WALK_LIMITS,
): void {
  const budget = walkBudget(limits);
  const visit = (rel: string, depth: number) => {
    budget.count();
    const from = posix.join(root, rel);
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(from);
    } catch {
      notes.push(`${rel}: deleted (nothing to copy)`);
      return;
    }
    if (st.isSymbolicLink()) {
      notes.push(`${rel}: symlink to ${readlinkSync(from)} (not copied)`);
    } else if (st.isDirectory()) {
      budget.enter(depth);
      mkdirSync(resolve(dir, rel), { recursive: true });
      notes.push(`${rel}/: directory`);
      for (const entry of readdirSync(from)) visit(posix.join(rel, entry), depth + 1);
    } else if (st.isFile()) {
      if (done.has(rel)) return;
      if (st.size > MAX_QUARANTINE_FILE_BYTES) {
        // Counts only: a file name can hold text the owner never chose (a quiet run's screen text).
        throw new Error("a file is too large to quarantine (nothing was deleted)");
      }
      const to = resolve(dir, rel);
      mkdirSync(resolve(to, ".."), { recursive: true });
      copyFileSync(from, to, constants.COPYFILE_EXCL);
      done.add(rel);
      notes.push(`${rel}: copied`);
    } else {
      notes.push(`${rel}: special file (not copied)`);
    }
  };
  for (const change of changes) visit(change.path.replace(/\/$/, ""), 0);
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export function restoreGitMetadata(
  root: string,
  gitMeta: Map<string, string>,
  gitRestore: Map<string, Buffer>,
  notes: string[],
): void {
  for (const [path, data] of gitRestore) {
    if (hashOf(root, path) === gitMeta.get(path)) continue;
    const dirPath = posix.join(root, posix.dirname(path));
    if (isLink(dirPath)) rmSync(dirPath, { force: true });
    mkdirSync(dirPath, { recursive: true });
    if (isLink(posix.join(root, path))) rmSync(posix.join(root, path), { force: true });
    writeFileSync(posix.join(root, path), data);
    notes.push(`${path}: restored from snapshot`);
  }
  for (const path of gitMetaPaths(root)) {
    if (path.startsWith(".git/info/") && !gitMeta.has(path)) {
      rmSync(posix.join(root, path), { force: true });
      notes.push(`${path}: removed (added during run)`);
    }
  }
}
