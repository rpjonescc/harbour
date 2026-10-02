import { join } from "node:path";
import { contentPaths } from "@/lib/content/paths";
import { readBoundedBytes } from "@/lib/note/bounded-read";

const MAX_TERMS = 200;
const MAX_TERM_CHARS = 60;

/** A never-mention list the digest cannot honour; the message is a plain sentence with no term in it. */
export class NeverMentionError extends Error {}

/**
 * The owner's list of names and terms to keep out of everything (one per line, `- ` optional).
 * A list that cannot be honoured in full (too large, an over-long term, more than 200 terms)
 * throws: silently dropping a term would publish what the owner asked never to mention.
 */
export function readNeverMention(root: string): string[] {
  let bytes: Buffer | null;
  try {
    bytes = readBoundedBytes(join(root, contentPaths.neverMention), 16 * 1024);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (bytes === null) {
    throw new NeverMentionError(
      "The never-mention list is too large or not a plain file, so no digest was made. Shorten it.",
    );
  }
  const terms = bytes
    .toString("utf8")
    .split("\n")
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter((line) => line.length >= 2 && !line.startsWith("#"));
  if (terms.some((term) => term.length > MAX_TERM_CHARS)) {
    throw new NeverMentionError(
      `A term in the never-mention list is over ${MAX_TERM_CHARS} characters, so no digest was made. Shorten it.`,
    );
  }
  if (terms.length > MAX_TERMS) {
    throw new NeverMentionError(
      `The never-mention list has more than ${MAX_TERMS} terms, so no digest was made. Remove some.`,
    );
  }
  return terms;
}
