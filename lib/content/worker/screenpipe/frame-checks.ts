import { canonicalise, loosePattern, matchKey, skeleton } from "./canonical";
import { PRIVATE_CUES } from "./private-cues";
import { CARD, CREDENTIAL_URL, EMAIL, PHONE } from "./redact-rules";

const cuePattern = (cue: string): RegExp | null =>
  loosePattern(cue, { shortGap: "[^\\p{L}\\p{N}]?", wholeWord: true, flags: "u" });

const PATTERNS = PRIVATE_CUES.flatMap((cue) => {
  const pattern = cuePattern(cue);
  return pattern === null ? [] : [pattern];
});

/**
 * The matching key with the commonest scanner mistakes undone, for cues only (never for
 * redaction): a zero for "o", and a digit one, bar or capital I for "l" ("passw0rd", "Iog in",
 * "Gmai1"), and "rn" for "m" ("rnail"). Applied before lower-casing, so a capital I is still seen.
 */
function foldedKey(canonical: string): string {
  return skeleton(canonical)
    .replace(/[1|I]/g, "l")
    .replace(/0/g, "o")
    .toLowerCase()
    .replace(/rn/g, "m");
}

/**
 * True when screen text holds a private-context cue, on the plain key or on the folded one.
 * Zero-width characters, full-width letters and lookalike letters cannot hide a cue.
 */
export function hasPrivateCue(text: string): boolean {
  const canonical = canonicalise(text);
  const keys = [matchKey(canonical), foldedKey(canonical)];
  return PATTERNS.some((pattern) => keys.some((key) => pattern.test(key)));
}

const once = (pattern: RegExp): RegExp =>
  new RegExp(pattern.source, pattern.flags.replace("g", ""));
const PERSONAL = [EMAIL, PHONE, CARD, CREDENTIAL_URL].map(once);

/**
 * True when screen text shows an email address, a phone or card-like number or a link with a
 * password in it. A whole screen that does is dropped before redaction (over-excluding is the
 * intended failure): redaction hides the value, but not that the screen is about a person.
 */
export function hasPersonalData(text: string): boolean {
  const key = skeleton(canonicalise(text));
  return PERSONAL.some((pattern) => pattern.test(key));
}
