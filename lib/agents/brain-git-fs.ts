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
export function gitMetaPaths(root: string): string[] {
  const out = [".git/config", ".git/HEAD", ".git/packed-refs", ".gitmodules"];
  const walk = (rel: string) => {
    let entries: Dirent[];
    try {
      if (!lstatSync(posix.join(root, rel)).isDirectory()) return; // not a dir, or a symlink
      entries = readdirSync(posix.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk(".git/info");
  walk(".git/refs");
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

/** Nested `.git` entries under `starts`, found by an lstat walk (never follows symlinks). */
export function nestedGitDirs(root: string, starts: string[]): string[] {
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
 * cap. Symlinks and special files are noted, not copied. Files in `done` are skipped.
 */
export function quarantine(
  root: string,
  dir: string,
  changes: { path: string }[],
  notes: string[],
  done: Set<string>,
): void {
  const visit = (rel: string) => {
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
      mkdirSync(resolve(dir, rel), { recursive: true });
      notes.push(`${rel}/: directory`);
      for (const entry of readdirSync(from)) visit(posix.join(rel, entry));
    } else if (st.isFile()) {
      if (done.has(rel)) return;
      if (st.size > MAX_QUARANTINE_FILE_BYTES) {
        throw new Error(`file too large to quarantine (nothing was deleted): ${rel}`);
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
  for (const change of changes) visit(change.path.replace(/\/$/, ""));
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
