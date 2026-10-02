import { join } from "node:path";
import { contentPaths } from "@/lib/content/paths";
import { readBoundedBytes } from "@/lib/note/bounded-read";

/** The owner's list of names and terms to keep out of everything (one per line, `- ` optional). */
export function readNeverMention(root: string): string[] {
  let bytes: Buffer | null;
  try {
    bytes = readBoundedBytes(join(root, contentPaths.neverMention), 16 * 1024);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  // Too large, a symlink or not a regular file: an unreadable list must not mean "no terms".
  if (bytes === null) throw new Error("content/never-mention.md is too large or not a plain file");
  return bytes
    .toString("utf8")
    .split("\n")
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter((line) => line.length >= 2 && line.length <= 60 && !line.startsWith("#"))
    .slice(0, 200);
}
