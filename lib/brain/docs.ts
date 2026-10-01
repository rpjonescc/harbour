import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { type Frontmatter, splitFrontmatter } from "./frontmatter";
import { resolveBrainPath } from "./paths";

export type BrainDoc = {
  path: string;
  absolutePath: string;
  title: string;
  frontmatter: Frontmatter;
  frontmatterError: string | null;
  body: string;
  mtime: Date;
};

/** Frontmatter title, else the first `# ` heading, else the file name. */
export function titleFor(path: string, frontmatter: Frontmatter, body: string): string {
  if (frontmatter.title) return frontmatter.title;
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return heading || basename(path, ".md");
}

/** Reads one document. Throws BrainPathError for invalid or outside paths. */
export function readDoc(root: string, path: string): BrainDoc {
  const absolutePath = resolveBrainPath(root, path);
  const parsed = splitFrontmatter(readFileSync(absolutePath, "utf8"));
  return {
    path,
    absolutePath,
    ...parsed,
    title: titleFor(path, parsed.frontmatter, parsed.body),
    mtime: statSync(absolutePath).mtime,
  };
}

export type BrainRootStatus =
  | { ok: true }
  | { ok: false; reason: "missing" | "not-directory" | "unreadable" };

/** Whether HARBOUR_BRAIN_DIR points at a usable directory. */
export function checkBrainRoot(root: string): BrainRootStatus {
  try {
    if (!statSync(root).isDirectory()) return { ok: false, reason: "not-directory" };
    accessSync(root, constants.R_OK | constants.X_OK);
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    return { ok: false, reason: code === "ENOENT" ? "missing" : "unreadable" };
  }
}
