import { z } from "zod";
import { unknownNumbers } from "@/lib/content/numbers";
import { sanitiseText } from "@/lib/content/sanitise";
import { refSchema } from "@/lib/content/schema";
import { wordCount } from "@/lib/content/shapes";
import type { FactItem } from "./facts-pack";

const text = (max: number) => z.string().trim().min(1).max(max);
export const draftWorkSchema = z.strictObject({
  title: text(120),
  paragraphs: z
    .array(
      z.strictObject({
        id: z.string().regex(/^p\d{1,2}$/),
        text: text(1500),
        facts: z.array(refSchema).max(8),
      }),
    )
    .min(3)
    .max(40),
  questions: z.array(text(200)).max(5).default([]),
});
export type DraftWork = z.infer<typeof draftWorkSchema>;

const MIN_WORDS = 400;
const MAX_WORDS = 900;

// Markdown the source must not carry: it is plain text that later steps shape per platform.
const MARKDOWN = [
  /^\s*#/m, // heading
  /^\s*>/m, // quote
  /^\s*(?:[-*+]|\d+[.)])\s/m, // list item
  /^\s*\[[^\]]*\]:/m, // reference-style link definition
  /\*\*|__|`|~~/, // strong, code, strike
  /\*[^\s*][^*]*\*/, // emphasis
];

/** The host of the product's own site, the only one a draft may link to (none when the URL is odd). */
export function ownHosts(productUrl: string): string[] {
  if (!URL.canParse(productUrl)) return [];
  return [new URL(productUrl).hostname.toLowerCase().replace(/^www\./, "")];
}

/** One line of plain text: nothing hidden, no markup or markdown, and links only to `hosts`. */
function isPlainLine(value: string, hosts: readonly string[]): boolean {
  const clean = sanitiseText(value, "markdown", { allowedHosts: hosts });
  if (!clean.ok || clean.stripped || /[<>\n\r]|\]\(/.test(value)) return false;
  if (MARKDOWN.some((pattern) => pattern.test(value))) return false;
  // The markdown pass above has checked every link, with or without a scheme, against `hosts`.
  return true;
}

/** Why this draft cannot be used, in fixed words the agent can act on; null when it can. */
export function draftProblem(
  work: DraftWork,
  pack: readonly FactItem[],
  hosts: readonly string[],
): string | null {
  const refs = new Set(pack.map((f) => f.ref));
  const total = work.paragraphs.reduce((n, p) => n + wordCount(p.text), 0);
  if (total < MIN_WORDS || total > MAX_WORDS) {
    return `The draft has ${total} words; it must have ${MIN_WORDS} to ${MAX_WORDS}.`;
  }
  if (!isPlainLine(work.title, hosts)) return "The title must be one line of plain text.";
  if (!work.questions.every((q) => isPlainLine(q, hosts)))
    return "Each question must be one line of plain text.";
  for (const [i, p] of work.paragraphs.entries()) {
    if (p.id !== `p${i + 1}`) return "The paragraph ids must be p1, p2, p3 and so on, in order.";
    if (p.facts.some((f) => !refs.has(f)))
      return `Paragraph ${i + 1} cites a fact that is not in the list.`;
    if (!isPlainLine(p.text, hosts)) return `Paragraph ${i + 1} must be one line of plain text.`;
  }
  return null;
}

/**
 * The numbers in the title, paragraphs and questions that no fact holds (decision 12). Each fact's own text is
 * the source, not its `[ref]` label: a date in a label must not make that year look known.
 */
export function inventedNumbers(work: DraftWork, pack: readonly FactItem[]): string[] {
  const all = [work.title, ...work.paragraphs.map((p) => p.text), ...work.questions].join("\n");
  return unknownNumbers(all, ...pack.map((f) => f.text));
}

/** The owner's note on an idea whose draft used numbers from nowhere; numbers only, never the agent's words. */
export function inventedNumbersNote(jobId: number, numbers: readonly string[]): string {
  const shown = numbers.filter((n) => /^\d{1,9}(?:\.\d{1,4})?$/.test(n)).slice(0, 3);
  const list = shown.length > 0 ? `: ${shown.join(", ")}` : "";
  return `The draft from job ${jobId} used a number that isn't in your notes or activity${list}. Check your notes, then write it again.`;
}
