import { INVISIBLE_CHARS } from "./sanitise";

const UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = [
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
];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const BIG: [string, number][] = [
  ["hundred", 100],
  ["thousand", 1000],
  ["million", 1e6],
  ["billion", 1e9],
];
// "one" alone is a pronoun and is not counted; it only counts inside "twenty-one" and the like.
const WORDS: Record<string, number> = Object.fromEntries([
  ...UNITS.slice(1).map((w, i) => [w, i + 2]),
  ...TEENS.map((w, i) => [w, i + 10]),
  ...TENS.map((w, i) => [w, (i + 2) * 10]),
  ...BIG,
]);
const DASH = "[-\\u2010-\\u2013]";
const WORD_LIST = Object.keys(WORDS).join("|");
const NOT_IN_WORD = String.raw`(?<![\p{L}\p{N}])`;
const NOT_BEFORE_LETTER = String.raw`(?![\p{L}\p{N}])`;
// Longest reading first: "twenty-five", then "tenfold" or "twelve-fold", then a plain word.
const SPELLED = new RegExp(
  `${NOT_IN_WORD}(?:(?<tens>${TENS.join("|")})${DASH}(?<unit>${UNITS.join("|")})|(?<fold>${WORD_LIST})${DASH}?fold|(?<word>${WORD_LIST}))${NOT_BEFORE_LETTER}`,
  "giu",
);
// A digit run, not glued to digits before it. Names that merely contain digits are blanked first.
const DIGITS = /(?<!\p{N})(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gu;
const NAMES =
  /(?<![\p{L}\p{N}_])(?:p\d{1,2}|v\d+(?:\.\d+)*|x86|x64|h[1-6]|b2[bc]|3d|2fa|i18n|a11y)(?![\p{L}\p{N}_])/giu;
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

function spelled(match: RegExpMatchArray): string {
  const { tens, unit, fold, word } = match.groups ?? {};
  if (tens && unit) {
    return String((WORDS[tens.toLowerCase()] ?? 0) + UNITS.indexOf(unit.toLowerCase()) + 1);
  }
  return String(WORDS[(fold ?? word ?? "").toLowerCase()] ?? "");
}

/**
 * The numbers a reader would take for facts: digits (with commas, decimals, `$` and `%`), years,
 * and spelled-out numbers: two to twenty, the tens (thirty to ninety), "twenty-one" to "ninety-nine", hundred, thousand, million, billion and "-fold" forms. "one" alone is not counted (a pronoun). Digits glued to letters ("Top10", "Q4") are read, except a short list of names (p3, v2, x86, h1, b2b, 3d, 2fa, i18n, a11y). Normalised and de-duplicated.
 * Full-width and other scripts' digits count as digits, and hidden characters inside a number do
 * not split it, so formatting cannot hide a figure.
 */
export function extractNumbers(text: string): string[] {
  const seen = readable(text);
  const found = [
    ...(seen.replace(NAMES, " ").match(DIGITS) ?? []).map(normal),
    ...[...seen.matchAll(SPELLED)].map(spelled),
  ];
  return [...new Set(found)];
}

/** The numbers in `text` that none of `sources` holds. */
export function unknownNumbers(text: string, ...sources: string[]): string[] {
  const known = new Set(sources.flatMap(extractNumbers));
  return extractNumbers(text).filter((n) => !known.has(n));
}
