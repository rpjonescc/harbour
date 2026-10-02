import { INVISIBLE_CHARS } from "./sanitise";

const WORDS: Record<string, number> = Object.fromEntries(
  [
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ].map((w, i) => [w, i + 2]),
);
// Digits not glued to a letter, digit or underscore before them ("p3" and "x86" are names, not
// numbers). A comma only joins digits when three follow it, so "3,4" is two numbers.
const DIGITS = /(?<![\p{L}\p{N}_])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gu;
const SPELLED = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${Object.keys(WORDS).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);
const DECIMAL_DIGIT = /\p{Nd}/gu;

/** The ASCII digit a decimal digit of any script stands for (digit blocks run in tens from zero). */
function asciiDigit(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  let zero = code;
  while (zero > 0 && /^\p{Nd}$/u.test(String.fromCodePoint(zero - 1))) zero -= 1;
  return String((code - zero) % 10);
}

/** What a reader sees: compatibility forms folded (full-width digits), hidden characters gone, any script's digits as 0-9. */
const readable = (text: string): string =>
  text
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS, "")
    .normalize("NFKC")
    .replace(DECIMAL_DIGIT, asciiDigit);

/** Digits as one canonical string without Number(), so long figures never collide: "012.50" is "12.5". */
function normal(raw: string): string {
  const [whole = "", fraction = ""] = raw.replaceAll(",", "").split(".");
  const int = whole.replace(/^0+(?=\d)/, "");
  const frac = fraction.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/**
 * The numbers a reader would take for facts: digits (with commas, decimals, `$` and `%`), years,
 * and spelled-out two to twenty. "one" is not counted (a pronoun). Normalised and de-duplicated.
 * Full-width and other scripts' digits count as digits, and hidden characters inside a number do
 * not split it, so formatting cannot hide a figure.
 */
export function extractNumbers(text: string): string[] {
  const seen = readable(text);
  const found = [
    ...(seen.match(DIGITS) ?? []).map(normal),
    ...(seen.match(SPELLED) ?? []).map((w) => String(WORDS[w.toLowerCase()])),
  ];
  return [...new Set(found)];
}

/** The numbers in `text` that none of `sources` holds. */
export function unknownNumbers(text: string, ...sources: string[]): string[] {
  const known = new Set(sources.flatMap(extractNumbers));
  return extractNumbers(text).filter((n) => !known.has(n));
}
