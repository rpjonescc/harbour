/** Longest reason a Today card shows. */
const MAX_CHARS = 160;
/** Cutting at a word earlier than this would lose the point: cut mid-word instead. */
const MIN_WORD_CUT = 80;

/** Periods that end a word, not a sentence. "etc." is left out: it usually ends one. */
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|approx)\.$/i;

/** Index of the full stop, question or exclamation mark that ends the first sentence, or -1. */
function sentenceEnd(flat: string): number {
  for (const match of flat.matchAll(/[.!?](?=\s|$)/g)) {
    if (!ABBREVIATION.test(flat.slice(0, match.index + 1))) return match.index;
  }
  return -1;
}

/**
 * The first sentence of `text` on one line, at most 160 characters (cut at a word, with "…").
 * Reasons can come from the weekly analyst, so length and line breaks are never trusted.
 */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = sentenceEnd(flat);
  const sentence = end === -1 ? flat : flat.slice(0, end + 1);
  if (sentence.length <= MAX_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_CHARS - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= MIN_WORD_CUT ? cut.slice(0, space) : cut).trimEnd()}…`;
}
