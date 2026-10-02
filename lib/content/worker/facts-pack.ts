import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { Pillar } from "@/lib/agents/pillars";
import { redactSensitive } from "@/lib/analyst/scrub";
import { resolveBrainPath } from "@/lib/brain/paths";
import { parseFile } from "@/lib/content/files";
import { contentPaths } from "@/lib/content/paths";
import { digestFrontmatter, type IdeaFront } from "@/lib/content/schema";
import { readBoundedBytes, readPrefixBytes } from "@/lib/note/bounded-read";
import type { ContentProduct } from "@/lib/products/content";
import { hasControlChars, stripInvisible } from "@/lib/text/hidden-chars";

export const FACTS_PACK_BYTES = 48 * 1024;
const DOC_BYTES = 6 * 1024;
const DIGEST_BYTES = 64 * 1024;
export type FactItem = { ref: string; text: string; truncated: boolean };

/** A cited source exists but cannot be used; the message is fixed words, never the file's name or text. */
export class FactsPackError extends Error {}
const UNREADABLE =
  "A note or activity theme this idea rests on can't be read as plain text, so nothing was written. Check the notes folder, then try again.";

const gap = (error: unknown) =>
  ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "");

/** UTF-8 text of `bytes`; a prefix cut mid-character loses that character. Throws on anything else. */
function decode(bytes: Buffer, truncated: boolean): string {
  const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  for (let cut = 0; cut <= (truncated ? 3 : 0); cut += 1) {
    try {
      return strict.decode(bytes.subarray(0, bytes.length - cut));
    } catch {
      // try again one byte shorter: a prefix can end inside a multi-byte character
    }
  }
  throw new FactsPackError(UNREADABLE);
}

/** Hidden characters out first (they could split an email or a number), then a control character is a refusal. */
function plain(text: string): string {
  const visible = stripInvisible(text).replace(/\r\n?/g, "\n");
  if (hasControlChars(visible, { tab: true })) throw new FactsPackError(UNREADABLE);
  return visible.normalize("NFC");
}

function themeText(root: string, ref: string, productId: string): string | null {
  const match = /^digest:(\d{4}-\d{2}-\d{2})#(t\d{1,2})$/.exec(ref);
  if (!match?.[1]) return null;
  let bytes: Buffer | null;
  try {
    bytes = readBoundedBytes(join(root, contentPaths.digest(match[1])), DIGEST_BYTES);
  } catch (error) {
    if (gap(error)) return null; // no digest that day is a gap, not a fact
    throw new FactsPackError(UNREADABLE);
  }
  if (bytes === null) throw new FactsPackError(UNREADABLE);
  const parsed = parseFile(decode(bytes, false), digestFrontmatter);
  if (!parsed.ok) throw new FactsPackError(UNREADABLE);
  const theme = parsed.value.themes.find((t) => t.id === match[2] && t.productId === productId);
  return theme?.text ?? null;
}

/** Only this product's notes and the research folder: never the content folder, other products or hidden files. */
function mayCite(rel: string, productId: string): boolean {
  if (rel.split("/").some((s) => s === "" || s.startsWith("."))) return false;
  return rel.startsWith(`products/${productId}/`) || rel.startsWith("research/");
}

function document(root: string, rel: string, productId: string): FactItem | null {
  if (!mayCite(rel, productId)) return null;
  try {
    lstatSync(join(root, rel));
  } catch (error) {
    if (gap(error)) return null; // a note that is not there (yet) is a gap
    throw new FactsPackError(UNREADABLE);
  }
  try {
    const { bytes, truncated } = readPrefixBytes(resolveBrainPath(root, rel), DOC_BYTES);
    return { ref: `brain:${rel}`, text: decode(bytes, truncated), truncated };
  } catch (error) {
    if (error instanceof FactsPackError) throw error;
    throw new FactsPackError(UNREADABLE); // a link, a pipe or a folder where a note should be
  }
}

/** `text` cut to at most `max` bytes, never in the middle of a character (a U+FFFD that was in the text stays). */
function cutBytes(text: string, max: number): string {
  const all = Buffer.from(text);
  if (all.length <= max) return text;
  let end = max;
  // Back up over continuation bytes to the start of the character the cut would have split.
  while (end > 0 && ((all[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return all.subarray(0, end).toString("utf8");
}

/**
 * The list the draft and the gates check claims against (spec §7.2): the product, the idea's
 * pillar, the themes and documents it cites, and the product's notes. Secrets and absolute paths
 * are redacted, hidden characters removed, and the whole pack is capped at 48 KiB (later items are
 * cut first). A source that is missing is a gap; one that is there but unusable throws FactsPackError.
 */
export function buildFactsPack(input: {
  root: string;
  product: ContentProduct;
  idea: IdeaFront;
  pillars: Pillar[];
}): FactItem[] {
  const { root, product, idea } = input;
  const items: FactItem[] = [
    {
      ref: `product:${product.id}`,
      text: product.url ? `${product.name} at ${product.url}` : product.name,
      truncated: false,
    },
  ];
  const pillar = input.pillars.find((p) => p.key === idea.pillar);
  if (pillar) {
    items.push({
      ref: `pillar:${pillar.key}`,
      text: `${pillar.name}: ${pillar.description}`,
      truncated: false,
    });
  }
  // De-duplicated before anything is read, so a repeated ref cannot spend the cap twice.
  for (const ref of new Set(idea.sources.filter((s) => s.startsWith("digest:")))) {
    const text = themeText(root, ref, product.id);
    if (text) items.push({ ref, text, truncated: false });
  }
  const cited = idea.sources.filter((s) => s.startsWith("brain:")).map((s) => s.slice(6));
  const docs = [`products/${product.id}/notes.md`, `products/${product.id}/discovery.md`, ...cited];
  for (const rel of new Set(docs)) {
    const doc = document(root, rel, product.id);
    if (doc) items.push(doc);
  }
  return capPack(items);
}

function capPack(items: FactItem[]): FactItem[] {
  let left = FACTS_PACK_BYTES;
  const capped: FactItem[] = [];
  for (const item of items) {
    if (left <= 0) break;
    const text = redactSensitive(plain(item.text));
    const kept = cutBytes(text, left);
    capped.push({ ...item, text: kept, truncated: item.truncated || kept.length < text.length });
    left -= Buffer.byteLength(kept);
  }
  return capped;
}

/** The pack as one labelled text for a prompt. Number checks use each item's `text`, never these labels. */
export const factsPackText = (pack: readonly FactItem[]): string =>
  pack.map((f) => `[${f.ref}]\n${f.text}${f.truncated ? "\n(cut short)" : ""}`).join("\n\n");

// A leading YAML block (notes often carry one) and ISO dates are bookkeeping, not claims the
// owner made: their digits would otherwise make a year or a day count as "known" in a piece.
const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * What the numbers check compares a piece with: each item's own words, never its `[ref]` label,
 * without frontmatter or ISO dates. The one place that builds it, for the facts gate and for an
 * owner's edit.
 */
export const factsCheckText = (pack: readonly FactItem[]): string =>
  pack.map((f) => f.text.replace(FRONTMATTER, "").replace(ISO_DATE, " ")).join("\n");
