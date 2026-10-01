import { readdirSync } from "node:fs";
import { join } from "node:path";

export type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string };

export const TREE_LIMIT = 5000;

/** Markdown files and the folders that contain them. Hidden entries and symlinks are skipped. */
export function listTree(
  root: string,
  limit = TREE_LIMIT,
): { nodes: TreeNode[]; truncated: boolean } {
  let count = 0;
  let truncated = false;

  function walk(dir: string, prefix: string): TreeNode[] {
    const entries = readdirSync(dir, { withFileTypes: true })
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
        const children = walk(join(dir, entry.name), path);
        if (children.length > 0) nodes.push({ kind: "dir", name: entry.name, path, children });
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count += 1;
        nodes.push({ kind: "file", name: entry.name, path });
      }
    }
    return nodes;
  }

  return { nodes: walk(root, ""), truncated };
}

/** All file paths in a tree, in tree order. */
export function filePaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : filePaths(node.children)));
}
