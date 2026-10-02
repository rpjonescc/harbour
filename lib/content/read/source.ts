import { join } from "node:path";
import { parseFile } from "@/lib/content/files";
import { contentPaths } from "@/lib/content/paths";
import { type SourceFront, sourceFrontmatter } from "@/lib/content/schema";
import { readBoundedBytes } from "@/lib/note/bounded-read";

export type SourceRead = { front: SourceFront; paragraphs: { id: string; text: string }[] };

const MAX_SOURCE_BYTES = 128 * 1024;

function decode(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * An idea's source piece, or null when there is none or it is not valid (a link, a pipe, an
 * oversized or non-UTF-8 file, or a body that does not match its paragraph ids). The web process only reads.
 */
export function readSource(root: string, ideaId: string): SourceRead | null {
  let bytes: Buffer | null;
  try {
    bytes = readBoundedBytes(join(root, contentPaths.source(ideaId)), MAX_SOURCE_BYTES);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const text = bytes === null ? null : decode(bytes);
  const parsed = text === null ? null : parseFile(text, sourceFrontmatter);
  if (!parsed?.ok) return null;
  const texts = parsed.body.trim().split(/\n\n+/);
  if (texts.length !== parsed.value.paragraphs.length) return null;
  return {
    front: parsed.value,
    paragraphs: parsed.value.paragraphs.map((id, i) => ({ id, text: texts[i] ?? "" })),
  };
}
