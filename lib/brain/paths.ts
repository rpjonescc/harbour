import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/** A requested brain path that is invalid, missing, or outside the brain. Render as 404. */
export class BrainPathError extends Error {}

/**
 * Resolves a brain-relative `.md` path to its absolute path inside the brain root.
 * Symlinks anywhere below the root are refused (the tree skips them too), so the
 * hidden-segment and `.md` rules always apply to the file actually read.
 */
export function resolveBrainPath(root: string, relativePath: string): string {
  if (relativePath.length === 0 || relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw new BrainPathError("invalid path");
  }
  const segments = relativePath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) {
    throw new BrainPathError("invalid path segment");
  }
  if (!relativePath.endsWith(".md")) throw new BrainPathError("only markdown documents");

  let current = realpathSync(root);
  segments.forEach((segment, index) => {
    current = join(current, segment);
    let stats: ReturnType<typeof lstatSync>;
    try {
      stats = lstatSync(current);
    } catch {
      throw new BrainPathError("not found");
    }
    if (stats.isSymbolicLink()) throw new BrainPathError("symlinks are not followed");
    const isLast = index === segments.length - 1;
    if (isLast ? !stats.isFile() : !stats.isDirectory()) {
      throw new BrainPathError(isLast ? "not a file" : "not a directory");
    }
  });
  return current;
}
