import { execFileSync } from "node:child_process";
import type { SourceFile } from "./file-size";

/** Reads the exact blobs Git would commit, including files changed or deleted in the worktree. */
export function readStagedFiles(cwd = process.cwd()): SourceFile[] {
  const entries = execFileSync("git", ["ls-files", "--stage", "-z"], { cwd })
    .toString("utf8")
    .split("\0");
  const files: SourceFile[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const match = /^(?:\d+) ([0-9a-f]+) [0-3]\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error("Could not parse a staged Git entry");
    const [, hash, path] = match;
    if (!hash || !path) throw new Error("Staged Git entry is incomplete");
    const blob = execFileSync("git", ["cat-file", "blob", hash], { cwd });
    if (blob.includes(0)) continue;
    files.push({ path, content: blob.toString("utf8") });
  }
  return files;
}
