import { type Dirent, opendirSync } from "node:fs";
import { join } from "node:path";
import { ENTRY_LIMIT, TREE_LIMIT } from "./tree-limits";

export type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string };

export { TREE_LIMIT } from "./tree-limits";

const MAX_DEPTH = 64;

function readEntries(dir: string, remaining: number): { entries: Dirent[]; overflow: boolean } {
  const handle = opendirSync(dir);
  const entries: Dirent[] = [];
  try {
    for (let i = 0; i <= remaining; i += 1) {
      const entry = handle.readSync();
      if (!entry) break;
      entries.push(entry);
    }
  } finally {
    handle.closeSync();
  }
  const overflow = entries.length > remaining;
  if (overflow) entries.pop();
  return { entries, overflow };
}

/** Markdown files and the folders that contain them. Hidden entries and symlinks are skipped. */
export function listTree(
  root: string,
  limit = TREE_LIMIT,
  entryLimit = ENTRY_LIMIT,
): { nodes: TreeNode[]; truncated: boolean } {
  let count = 0;
  let visited = 0;
  let truncated = false;

  function walk(dir: string, prefix: string, depth: number): TreeNode[] {
    if (depth >= MAX_DEPTH || visited >= entryLimit) {
      truncated = true;
      return [];
    }
    const read = readEntries(dir, entryLimit - visited);
    visited += read.entries.length;
    if (read.overflow) truncated = true;
    const entries = read.entries
      .filter((entry) => !entry.name.startsWith(".") && !entry.isSymbolicLink())
      .sort(
        (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
      );
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (count >= limit) {
        truncated = true;
        break;
      }
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const children = walk(join(dir, entry.name), path, depth + 1);
        if (children.length > 0) nodes.push({ kind: "dir", name: entry.name, path, children });
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count += 1;
        nodes.push({ kind: "file", name: entry.name, path });
      }
    }
    return nodes;
  }

  return { nodes: walk(root, "", 0), truncated };
}

/** All file paths in a tree, in tree order. */
export function filePaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : filePaths(node.children)));
}
