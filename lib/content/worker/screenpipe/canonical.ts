import { INVISIBLE_CHARS } from "@/lib/text/hidden-chars";

// Screen text and agent output are hostile: before anything is matched they are brought to one
// canonical form, so an invisible character, a full-width letter, a stacked accent or a lookalike
// letter cannot hide a secret or a forbidden term from a rule.

// Control, line and paragraph separators become a space (so words stay apart); format characters
// (zero-width, bidi, soft hyphen, tags), private-use, lone surrogates, variation selectors and
// blank-looking letters vanish. Written as escapes: a literal invisible character cannot be reviewed.
const SEPARATORS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
const MARKS = /\p{M}/gu;

/** Lookalike letters from Cyrillic and Greek, mapped to the Latin letter they imitate. */
const CONFUSABLES: Readonly<Record<string, string>> = Object.fromEntries([
  ["\u0430", "a"],
  ["\u0435", "e"],
  ["\u043e", "o"],
  ["\u0440", "p"],
  ["\u0441", "c"],
  ["\u0443", "y"],
  ["\u0445", "x"],
  ["\u0456", "i"],
  ["\u0458", "j"],
  ["\u0455", "s"],
  ["\u04bb", "h"],
  ["\u0501", "d"],
  ["\u051b", "q"],
  ["\u051d", "w"],
  ["\u043a", "k"],
  ["\u043c", "m"],
  ["\u043d", "h"],
  ["\u0442", "t"],
  ["\u0432", "b"],
  ["\u04cf", "l"],
  ["\u0410", "A"],
  ["\u0412", "B"],
  ["\u0415", "E"],
  ["\u041a", "K"],
  ["\u041c", "M"],
  ["\u041d", "H"],
  ["\u041e", "O"],
  ["\u0420", "P"],
  ["\u0421", "C"],
  ["\u0422", "T"],
  ["\u0425", "X"],
  ["\u0423", "Y"],
  ["\u0406", "I"],
  ["\u0408", "J"],
  ["\u0405", "S"],
  ["\u03bf", "o"],
  ["\u03b1", "a"],
  ["\u03bd", "v"],
  ["\u03c1", "p"],
  ["\u03b9", "i"],
  ["\u03ba", "k"],
  ["\u03c4", "t"],
  ["\u03c5", "u"],
  ["\u03c7", "x"],
  ["\u03b5", "e"],
  ["\u0391", "A"],
  ["\u0392", "B"],
  ["\u0395", "E"],
  ["\u0396", "Z"],
  ["\u0397", "H"],
  ["\u0399", "I"],
  ["\u039a", "K"],
  ["\u039c", "M"],
  ["\u039d", "N"],
  ["\u039f", "O"],
  ["\u03a1", "P"],
  ["\u03a4", "T"],
  ["\u03a5", "Y"],
  ["\u03a7", "X"],
] as const);
const FOREIGN_DIGIT = /^\p{Nd}$/u;

/**
 * One line of NFKC text with no hidden characters or accents. Strip first, then normalise, then
 * strip again: normalising can itself produce spaces or marks.
 */
export function canonicalise(text: string): string {
  return (
    text
      .replace(SEPARATORS, " ")
      .replace(INVISIBLE_CHARS, "")
      .normalize("NFKC")
      // Full stops NFKC leaves alone: "attacker\u3002com" is a domain to a reader.
      .replace(/[\u3002\uff61]/g, ".")
      .normalize("NFD")
      .replace(MARKS, "")
      .normalize("NFC")
      .replace(SEPARATORS, " ")
      .replace(INVISIBLE_CHARS, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A copy of canonical text for matching only, the same length in UTF-16 units so a match's span
 * can be cut out of the original: lookalike letters become Latin and non-ASCII digits become 0.
 */
export function skeleton(text: string): string {
  let out = "";
  for (const char of text) {
    const mapped = CONFUSABLES[char] ?? (FOREIGN_DIGIT.test(char) && char > "\u007f" ? "0" : char);
    out += mapped.length === char.length ? mapped : mapped.repeat(char.length);
  }
  return out;
}

/** Lower-case matching key: canonical, lookalikes folded. */
export const matchKey = (text: string): string => skeleton(canonicalise(text)).toLowerCase();

/**
 * A case-insensitive pattern for a term that also matches it with other characters between its
 * letters ("Project  Zephyr", "project-zephyr", "p r o j e c t"), or null when the term has no
 * letters or digits (an empty term must never match everything). Terms under four characters match
 * as written, so a short term is not read out of unrelated spaced letters.
 */
export function termPattern(term: string): RegExp | null {
  const chars = Array.from(matchKey(term)).filter((c) => /[\p{L}\p{N}]/u.test(c));
  if (chars.length === 0) return null;
  const between = chars.length < 4 ? "" : "[^\\p{L}\\p{N}]*";
  return new RegExp(chars.join(between), "giu");
}
