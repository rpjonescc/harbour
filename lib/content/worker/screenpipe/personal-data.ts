import { canonicalise, skeleton } from "./canonical";

// A narrow test for "this screen shows a person's contact or payment details", run on raw text
// before redaction (spec §18). It must not fire on what every screen shows: dates, clocks,
// versions, counts, issue and line numbers, hashes. Redaction of the excerpts that are kept still
// uses the broad rules in redact-rules.ts; over-redacting there is fine.

const EMAIL = /[^\s@<>"'()]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;
// A link with a user name and password, or a secret-looking query parameter with a real value.
const CREDENTIAL_URL =
  /[a-z][a-z0-9+.-]{1,15}:\/\/[^\s/@]+:[^\s/@]*@|[?&](?:token|access_token|session|sessionid|key|api_key|apikey|secret|password|auth|sig|signature)=[^\s&]{8,}/;
const CARD_CANDIDATE = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
// Clear phone shapes only: a leading country code, a bracketed area code, a national mobile
// number in groups, or three-three-four groups.
const PHONE_SHAPES = [
  /(?<![\w+])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/,
  /(?<![\d(])\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/,
  /(?<![\d./:+-])0\d{2,3}[ -]\d{3}[ -]\d{3,4}(?!\d)/,
  /(?<![\d./:+-])0\d[ -]\d{4}[ -]\d{4}(?!\d)/,
  /(?<![\d./:+-])\d{3}[-. ]\d{3}[-. ]\d{4}(?!\d)/,
];

/** The Luhn check that real card numbers pass and most digit runs do not. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const hasCard = (key: string): boolean =>
  [...key.matchAll(CARD_CANDIDATE)].some((m) => luhnValid(m[0].replace(/\D/g, "")));

const digitsIn = (text: string): number => text.replace(/\D/g, "").length;

const hasPhone = (key: string): boolean =>
  PHONE_SHAPES.some((shape) => {
    const found = shape.exec(key);
    return found !== null && digitsIn(found[0]) >= 8 && digitsIn(found[0]) <= 15;
  });

/**
 * True when screen text shows an email address, a credential link, a Luhn-valid card-like number
 * or a phone number in a clear phone shape. A whole screen that does is dropped (over-excluding is
 * the intended failure): redaction hides the value, but not that the screen is about a person.
 */
export function hasPersonalData(text: string): boolean {
  const key = skeleton(canonicalise(text));
  return EMAIL.test(key) || CREDENTIAL_URL.test(key) || hasCard(key) || hasPhone(key);
}
