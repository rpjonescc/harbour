import { createHash } from "node:crypto";
import {
  copyFileSync,
  type Dirent,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { posix, resolve } from "node:path";

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
  return path === ".git/config" || path.startsWith(".git/info/");
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

/** Copies each change's current content into the quarantine; returns what was copied. */
export function quarantine(
  root: string,
  dir: string,
  changes: { path: string }[],
  notes: string[],
): string[] {
  const copied: string[] = [];
  for (const change of changes) {
    const from = posix.join(root, change.path);
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(from);
    } catch {
      notes.push(`${change.path}: deleted (nothing to copy)`);
      continue;
    }
    if (st.isSymbolicLink()) {
      notes.push(`${change.path}: symlink to ${readlinkSync(from)} (not copied)`);
    } else if (st.isFile()) {
      const to = resolve(dir, change.path);
      mkdirSync(resolve(to, ".."), { recursive: true });
      copyFileSync(from, to);
      copied.push(change.path);
      notes.push(`${change.path}: copied`);
    }
  }
  return copied;
}

export function restoreGitMetadata(
  root: string,
  gitMeta: Map<string, string>,
  gitRestore: Map<string, Buffer>,
  notes: string[],
): void {
  for (const [path, data] of gitRestore) {
    if (hashOf(root, path) === gitMeta.get(path)) continue;
    mkdirSync(posix.join(root, posix.dirname(path)), { recursive: true });
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
