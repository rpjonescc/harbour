import { KNOWN_TLDS as TLDS } from "@/lib/content/sanitise";
import { domainKey } from "@/lib/scan/site";
import { matchKey, skeleton } from "./canonical";

// The redaction rules for screen text (spec §5.3 step 3): links, emails, numbers, secrets, paths.

// The lookbehind on EMAIL starts a match only at the start of a run: the same matches, but a long
// run with no "@" is read once instead of once per character.
const EMAIL = /(?<![^\s@<>"'()])[^\s@<>"'()]+@[^\s@<>"'()]+(?:\s\.[a-z]{2,})*/gi;
const CARD = /(?<!\d)\d(?:[\s.,\-_/]?\d){12,}(?!\d)/g;
const PHONE = /(?<!\d)\+?\d[\d\s().,-]{6,}\d(?!\d)/g;

const SLUG = "[\\w.~@%+=-]+";

export type Replacement = string | ((match: string) => string);
export type Rule = readonly [RegExp, Replacement];

/** Cuts every match of `pattern` (run on the matching copy) out of `text` at the same offsets. */
export function replaceOn(text: string, pattern: RegExp, to: Replacement): string {
  let out = "";
  let last = 0;
  for (const match of skeleton(text).matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    out += text.slice(last, start) + (typeof to === "string" ? to : to(text.slice(start, end)));
    last = end;
  }
  return out + text.slice(last);
}

/** The product's own host without scheme or path, read as domainKey reads it; "" when none. */
export function bareHost(host: unknown): string {
  if (typeof host !== "string") return "";
  const cleaned = matchKey(host).replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  return domainKey(cleaned.split(/[/?#:]/)[0] ?? "");
}

/**
 * Link-like text, most specific first. The product's own bare host is kept only when it is the
 * whole match: "docs.example.com.attacker.example/x" is a link, as is the host followed by a path.
 */
export function linkRules(host: string): Rule[] {
  const keepOwnHost = (match: string): string =>
    host !== "" && match.toLowerCase() === host ? match : "[link]";
  return [
    [/[a-z][a-z0-9+.-]{1,15}:\/\/\S+/gi, "[link]"],
    [/\b(?:mailto|data|javascript|file|tel):\S+/gi, "[link]"],
    [/\bwww\.\S+/gi, "[link]"],
    // No TLD needed ("sam@localhost"); a domain split off by a line break is taken with it.
    [EMAIL, "[email]"],
    [
      // A listed TLD makes a bare host a link; any TLD does once a path, query or port follows.
      new RegExp(
        `(?<![\\w@-])(?:[a-z0-9-]+\\.)+(?:(?:${TLDS})(?![\\w-])(?:[/?#]\\S*|:\\d\\S*)?|[a-z]{2,}(?:[/?#]\\S*|:\\d\\S*))`,
        "gi",
      ),
      keepOwnHost,
    ],
  ];
}

// After the secret rules: a key like "sk-abcdef12345678" is one token, not a token and a phone number.
export const NUMBER_RULES: Rule[] = [
  [/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.]\d)/g, "[ip]"],
  [/(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}(?![0-9a-f:])/gi, "[ip]"],
  // Any separator between digits: a card number split by dots, slashes or underscores is still one.
  [CARD, "[number]"],
  [PHONE, "[phone]"],
];

export const SECRET_RULES: Rule[] = [
  [/(?<![\w@.])@\w{2,}/g, "[handle]"],
  [/\bauthorization\s*[:=]\s*(?:bearer|basic|token)?\s*\S+/gi, "[redacted]"],
  [/\b(?:password|passwd|passcode)\s+(?:is\s+)?\S+/gi, "[redacted]"],
  // A name ending in a secret word ("DB_PASSWORD", "client_secret") and its value.
  [
    /(?<![\w-])[\w-]*(?:password|passwd|pwd|pass|passcode|pin|secret|api[ _-]?key|apikey|token|auth)\s*[:=]\s*\S+/gi,
    "[redacted]",
  ],
  // Paths before tokens, so a long path reads as a path.
  [new RegExp(`(?<![\\w/])\\/(?:${SLUG}\\/)+(?:${SLUG})?`, "g"), "[path]"],
  [/(?<![\w/])[A-Za-z]:\\\S+/g, "[path]"],
  [new RegExp(`(?<![\\w/])${SLUG}(?:\\/${SLUG}){2,}`, "g"), "[path]"],
  [/\beyJ[\w-]{8,}\.[\w-]+(?:\.[\w-]*)?/g, "[token]"],
  [/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|xox[abprs])[-_][\w-]{8,}/gi, "[token]"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{12,}/g, "[token]"],
  [/[0-9a-f]{24,}/gi, "[token]"],
  [/(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{24,}={0,2}/g, "[token]"],
  [/(?<![A-Za-z])(?=[A-Za-z]*[a-z])(?=[A-Za-z]*[A-Z])[A-Za-z]{24,}(?![A-Za-z])/g, "[token]"],
];
