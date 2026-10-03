import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Pillar } from "@/lib/agents/pillars";
import { parseFile } from "@/lib/content/files";
import { contentPaths, isDigestName } from "@/lib/content/paths";
import { ideaFileIds, readAllIdeas } from "@/lib/content/read/ideas";
import { digestFrontmatter } from "@/lib/content/schema";
import { addDays } from "@/lib/format/iso-day";
import { readBoundedBytes, readPrefixBytes } from "@/lib/note/bounded-read";
import type { ContentProduct } from "@/lib/products/content";
import { hasControlChars, stripInvisible } from "@/lib/text/hidden-chars";

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
  /** No themes for this product in the last 7 days: ideas then come from the notes alone. */
  digestGap: boolean;
  /** A digest exists in the last 7 days (for any product), so a gap means "nothing on topic". */
  digestExists: boolean;
};

/** Thrown for an input the job cannot trust; the message is a fixed sentence the owner can act on. */
export class IdeasInputError extends Error {}

/** Text the agent may be shown: invisible characters stripped, NFC; null when it holds a control character. */
function cleanText(text: string): string | null {
  // Tabs and Windows line ends are ordinary in notes; the shared control check allows only "\n".
  const stripped = stripInvisible(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .normalize("NFC");
  return hasControlChars(stripped) ? null : stripped;
}

function themesSince(
  root: string,
  productId: string,
  since: string,
): { themes: SourceText[]; digestExists: boolean } {
  let names: string[];
  try {
    names = readdirSync(join(root, contentPaths.digestDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { themes: [], digestExists: false };
    throw error;
  }
  const days = names
    .filter(isDigestName)
    .map((n) => n.slice(0, 10))
    .filter((d) => d >= since)
    .sort();
  const themes = days.flatMap((day) => {
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
  return { themes, digestExists: days.length > 0 };
}

const UNREADABLE_TITLE =
  "An idea title holds characters Harbour will not use. Fix or remove that idea file, then try again.";
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
  const { themes, digestExists } = themesSince(root, product.id, addDays(today, -DIGEST_DAYS));
  const { ideas } = readAllIdeas(root, product.id);
  return {
    product,
    pillars,
    themes,
    notes: [`products/${product.id}/notes.md`, `products/${product.id}/discovery.md`].flatMap(
      (rel) => excerpt(root, rel) ?? [],
    ),
    recentTitles: ideas.slice(0, TITLES).map((i) => {
      const title = cleanText(i.front.title);
      if (title === null) throw new IdeasInputError(UNREADABLE_TITLE);
      return title;
    }),
    existingIds: ideaFileIds(root, product.id),
    waiting: ideas.filter((i) => i.front.state === "idea").length,
    digestGap: themes.length === 0,
    digestExists,
  };
}
