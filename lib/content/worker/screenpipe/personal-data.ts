import { canonicalise, skeleton } from "./canonical";

// A narrow test for "this screen shows a person's contact or payment details", run on raw text
// before redaction (spec §18). It must not fire on what every screen shows: dates, clocks,
// versions, counts, issue and line numbers, hashes. Redaction of the excerpts that are kept still
// uses the broad rules in redact-rules.ts; over-redacting there is fine.

const EMAIL = /[^\s@<>"'()]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;
// A link with a user name and password, or a secret-looking query parameter with a real value:
// a strong name (token, password, secret, API key) with 3 or more characters, or another
// credential-like name (key, code, session, auth, signature, x-amz-*) with 8 or more.
const CREDENTIAL_URL = [
  /[a-z][a-z0-9+.-]{1,15}:\/\/[^\s/@]+:[^\s/@]*@/,
  /[?&;](?:token|[a-z]+_token|api_?key|apikey|password|passwd|secret)=[^\s&]{3,}/,
  /[?&;](?:key|code|sessionid?|auth|sig|[\w-]*signature|x-amz-[\w-]+)=[^\s&]{8,}/,
];
// A card number starts with 2 to 6; that and the Luhn check keep epoch-millisecond timestamps and
// order numbers from reading as cards.
const CARD_CANDIDATE = /(?<!\d)[2-6](?:[ -]?\d){12,18}(?!\d)/g;
// Clear phone shapes only: a leading country code (with or without the plus), a bracketed area
// code, a national number in groups or unseparated, or three-three-four groups.
const PHONE_SHAPES = [
  /(?<![\w+])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/,
  /(?<![\d./:+-])61 ?[2-478](?: ?\d){8}(?!\d)/,
  /(?<![\d(])\(\d{2,4}\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/,
  /(?<![\d./:+-])0[2-478]\d{8}(?!\d)/,
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
 * True when screen text shows an email address, a credential link, a Luhn-valid card-like number starting 2 to 6
 * or a phone number in a clear phone shape. A whole screen that does is dropped (over-excluding is
 * the intended failure): redaction hides the value, but not that the screen is about a person.
 */
export function hasPersonalData(text: string): boolean {
  // Lower case, so "Sam.Jones@Example.com" and "?Token=..." are read like their lower-case forms.
  const key = skeleton(canonicalise(text)).toLowerCase();
  return (
    EMAIL.test(key) || CREDENTIAL_URL.some((p) => p.test(key)) || hasCard(key) || hasPhone(key)
  );
}
