// The one definition of text a reader cannot see, and of control characters. Everything that
// strips, refuses or normalises either goes through here, so no copy can fall behind the others.

/**
 * Format characters (zero-width, bidi, soft hyphen, tags, interlinear marks), private-use and
 * surrogate code points, variation selectors (including the E0100 supplement), every default-
 * ignorable code point, line and paragraph separators, and letters that render blank (combining
 * grapheme joiner, Hangul fillers, braille blank). Global: for stripping.
 */
export const INVISIBLE_CHARS =
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping each combining or joining character individually is the point.
  /[\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}\p{Variation_Selector}\p{Default_Ignorable_Code_Point}\u034f\u115f\u1160\u2800\u3164\uffa0]/gu;

const INVISIBLE_ONE = new RegExp(INVISIBLE_CHARS.source, "u");

/** True when `text` holds any invisible character. */
export const hasInvisible = (text: string): boolean => INVISIBLE_ONE.test(text);

/** Text with every invisible character removed. */
export const stripInvisible = (text: string): string => text.replace(INVISIBLE_CHARS, "");

/**
 * True when `text` holds a C0 or C1 control character or DEL. A newline is always allowed; tab and
 * carriage return only when asked for (notes and skill files are ordinary text with both).
 */
export function hasControlChars(
  text: string,
  allow: { tab?: boolean; carriageReturn?: boolean } = {},
): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x0a) continue;
    if (code === 0x09 && allow.tab) continue;
    if (code === 0x0d && allow.carriageReturn) continue;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
