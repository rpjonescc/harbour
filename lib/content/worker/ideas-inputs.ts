import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Pillar } from "@/lib/agents/proposals";
import { parseFile } from "@/lib/content/files";
import { contentPaths } from "@/lib/content/paths";
import { ideaFileIds, readIdeas } from "@/lib/content/read/ideas";
import { digestFrontmatter } from "@/lib/content/schema";
import { addDays } from "@/lib/format/zoned-time";
import { readBoundedBytes, readPrefixBytes } from "@/lib/note/bounded-read";
import type { ContentProduct } from "@/lib/products/content";

const EXCERPT_BYTES = 6 * 1024;
const DIGEST_DAYS = 7;
const TITLES = 30;
const MAX_DIGEST_BYTES = 64 * 1024;

export type SourceText = { ref: string; text: string };
export type IdeasInputs = {
  product: ContentProduct;
  pillars: Pillar[];
  themes: SourceText[];
  notes: (SourceText & { truncated: boolean })[];
  recentTitles: string[];
  /** Every idea file name in the product's folder, valid or not: none may be overwritten. */
  existingIds: Set<string>;
  /** Ideas still waiting for the owner: the backlog cap leaves room for 12 minus this. */
  waiting: number;
  /** No digest in the last 7 days: ideas then come from the notes alone. */
  digestGap: boolean;
};

/** Thrown for an input the job cannot trust; the message is a fixed sentence the owner can act on. */
export class IdeasInputError extends Error {}

// Zero-width, bidi, joiner, BOM, soft-hyphen, variation-selector and tag characters hide text from
// a reader but not from a model. Keep these as \u escapes: `pnpm fix` would turn them into the
// invisible characters themselves.
const INVISIBLE =
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping joining characters individually is the point.
  /[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u00ad\u061c\u180e\u034f\ufe00-\ufe0f]|[\u{e0000}-\u{e007f}]/gu;
// C0 and C1 controls and DEL; tab, newline and carriage return are allowed.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

/** Text the agent may be shown: invisible characters stripped, NFC; null when it holds a control character. */
function cleanText(text: string): string | null {
  const stripped = text.replace(INVISIBLE, "").normalize("NFC");
  return CONTROL.test(stripped) ? null : stripped;
}

function themesSince(root: string, productId: string, since: string): SourceText[] {
  let names: string[];
  try {
    names = readdirSync(join(root, contentPaths.digestDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const days = names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
    .map((n) => n.slice(0, 10))
    .filter((d) => d >= since)
    .sort();
  return days.flatMap((day) => {
    const bytes = readBoundedBytes(join(root, contentPaths.digest(day)), MAX_DIGEST_BYTES);
    const parsed = bytes === null ? null : parseFile(bytes.toString("utf8"), digestFrontmatter);
    // Fail closed: a digest that cannot be read is not the same as a quiet week.
    if (!parsed?.ok)
      throw new IdeasInputError(
        "A recent activity digest could not be read. Fix or remove the file, then try again.",
      );
    return parsed.value.themes
      .filter((t) => t.productId === productId)
      .flatMap((t) => {
        const text = cleanText(t.text);
        if (text === null)
          throw new IdeasInputError(
            "A recent activity digest holds characters Harbour will not use. Fix or remove the file, then try again.",
          );
        return [{ ref: `digest:${day}#${t.id}`, text }];
      });
  });
}

const UNREADABLE_NOTES =
  "A notes file for this product could not be read safely. Make sure it is a plain text file, then try again.";

/** The first 6 KiB of a notes file; null when it does not exist; a plain failure for anything unsafe. */
function excerpt(root: string, rel: string): (SourceText & { truncated: boolean }) | null {
  let read: { bytes: Buffer; truncated: boolean };
  try {
    read = readPrefixBytes(join(root, rel), EXCERPT_BYTES);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new IdeasInputError(UNREADABLE_NOTES);
  }
  const text = decodePrefix(read.bytes, read.truncated);
  const clean = text === null ? null : cleanText(text);
  if (clean === null) throw new IdeasInputError(UNREADABLE_NOTES);
  return { ref: `brain:${rel}`, text: clean, truncated: read.truncated };
}

/** UTF-8 text of `bytes`; a cut that lands inside a character drops that partial character. */
function decodePrefix(bytes: Buffer, truncated: boolean): string | null {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let drop = 0; drop <= (truncated ? 3 : 0); drop++) {
    try {
      return decoder.decode(bytes.subarray(0, bytes.length - drop));
    } catch {
      // try again one byte shorter
    }
  }
  return null;
}

/** Everything the ideas agent is shown for a product, read from the brain (worker only). */
export function gatherIdeasInputs(
  root: string,
  product: ContentProduct,
  pillars: Pillar[],
  today: string,
): IdeasInputs {
  const themes = themesSince(root, product.id, addDays(today, -DIGEST_DAYS));
  const { ideas } = readIdeas(root, product.id);
  return {
    product,
    pillars,
    themes,
    notes: [`products/${product.id}/notes.md`, `products/${product.id}/discovery.md`].flatMap(
      (rel) => excerpt(root, rel) ?? [],
    ),
    recentTitles: ideas.slice(0, TITLES).map((i) => i.front.title),
    existingIds: ideaFileIds(root, product.id),
    waiting: ideas.filter((i) => i.front.state === "idea").length,
    digestGap: themes.length === 0,
  };
}
