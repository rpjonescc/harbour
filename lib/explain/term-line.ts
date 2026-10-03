import type { TermId } from "./glossary";

/**
 * A sentence with glossary words in it: plain text, and words a `<Term>` explains in place. The
 * words stay in lib/explain; the component only renders them.
 */
export type TermLine = readonly (string | { term: TermId; text: string })[];

/** The line as plain text, for tests and anywhere a tip can't go. */
export function termLineText(line: TermLine): string {
  return line.map((part) => (typeof part === "string" ? part : part.text)).join("");
}
