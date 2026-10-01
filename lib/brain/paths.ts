import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

/** A requested brain path that is invalid, missing, or outside the brain. Render as 404. */
export class BrainPathError extends Error {}

/** Resolves a brain-relative `.md` path to its real absolute path inside the brain root. */
export function resolveBrainPath(root: string, relativePath: string): string {
  if (relativePath.length === 0 || relativePath.includes("\0") || isAbsolute(relativePath)) {
    throw new BrainPathError("invalid path");
  }
  const segments = relativePath.split("/");
  if (segments.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) {
    throw new BrainPathError("invalid path segment");
  }
  if (!relativePath.endsWith(".md")) throw new BrainPathError("only markdown documents");

  const rootReal = realpathSync(root);
  let fileReal: string;
  try {
    fileReal = realpathSync(join(rootReal, ...segments));
  } catch {
    throw new BrainPathError("not found");
  }
  const rel = relative(rootReal, fileReal);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new BrainPathError("outside the brain");
  }
  if (!statSync(fileReal).isFile()) throw new BrainPathError("not a file");
  return fileReal;
}
