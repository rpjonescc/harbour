import { canonicalise, matchKey, termPattern } from "./canonical";

const RUN = 20;
const BREAK = "\u0001";

/** The key with every product term replaced by a break, so a shared term never counts as a quote. */
function withoutTerms(text: string, terms: readonly string[]): string {
  let key = matchKey(canonicalise(text));
  for (const term of terms) {
    const pattern = termPattern(term);
    if (pattern) key = key.replace(new RegExp(pattern.source, "giu"), BREAK);
  }
  return key.replace(/\s+/g, " ");
}

/**
 * True when `theme` repeats a run of 20 or more characters from the filtered `snippets` word for
 * word (spec §8.2 residual): a theme is meant to be the model's own general words, and a long
 * verbatim run is the screen text itself. The product's own terms are left out of the comparison.
 */
export function quotesSnippets(
  theme: string,
  snippets: readonly string[],
  terms: readonly string[],
): boolean {
  const key = withoutTerms(theme, terms);
  if (key.length < RUN) return false;
  const haystack = snippets.map((s) => withoutTerms(s, terms)).join(BREAK);
  for (let i = 0; i + RUN <= key.length; i++) {
    const piece = key.slice(i, i + RUN);
    if (!piece.includes(BREAK) && haystack.includes(piece)) return true;
  }
  return false;
}
