import type { Platform } from "./ids";

export type SanitiseResult =
  | { ok: true; text: string; stripped: boolean }
  | { ok: false; reason: string };

// Zero-width, bidi, joiner, BOM, soft-hyphen, variation-selector, line-separator and Unicode tag
// characters hide or reorder text. They are stripped before normalising so they cannot split a
// character sequence and survive as a different one.
export const INVISIBLE_CHARS =
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping combining and joining characters individually is the point.
  /[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u00ad\u061c\u180e\u034f\ufe00-\ufe0f]|[\u{e0000}-\u{e007f}]/gu;
// C0 and C1 controls and DEL; newline is the one allowed. Shared with the ideas inputs.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
export const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
// A "<" that opens a tag, closing tag, comment, doctype or processing instruction, closed or not.
const HTML = /<[a-z/!?]/i;
const IMAGE = /!\[/;
const LINK_TITLE = /\]\([^)]*\s["'][^)]*\)/;
const FENCE = /^\s*(?:```|~~~)/m;
const FRONTMATTER_LINE = /^\s*---\s*$/m;
const INLINE_LINK = /\]\(\s*<?([^)\s>]*)/g;
const REFERENCE_LINK = /^ {0,3}\[[^\]]*\]:\s*<?(\S+)/gm;
const BARE_URL = /https?:\/\/[^\s)>\]]+/gi;
const BAD_HEADING = /^ {0,3}(?:#(?!#)|#{4,})\s/m;
const BAD_BLOCK = /^\s*(?:>|\|)/m;

// Top-level domains that make a bare word a link ("evil.example"); any other ends of 2+ letters
// do once a path, query or port follows.
export const KNOWN_TLDS =
  "com|net|org|io|co|ai|app|dev|xyz|me|tv|us|uk|au|nz|ca|de|fr|nl|se|eu|ch|es|it|in|ru|cn|jp|to|cc|ly|" +
  "info|biz|site|online|store|tech|page|link|cloud|example|test|invalid|local|internal|localhost|" +
  "shop|gov|edu|zip|mov|top|club|live|news|blog|work|space|world|pro|name|mobi|asia|win|bid|click|" +
  "icu|rest|fun|vip|lol|wtf|onion|download|support|email|team|tools";
// Hosts written without a scheme: "//host", "www.host" and "label.tld" (see KNOWN_TLDS).
const BARE_HOSTS = [
  /(?<![\w@.:/-])\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*)/gi,
  /\bwww\.([a-z0-9-]+(?:\.[a-z0-9-]+)*)/gi,
  new RegExp(
    `(?<![\\w@.-])((?:[a-z0-9-]+\\.)+(?:[a-z]{2,}(?=[/?#]|:\\d)|(?:${KNOWN_TLDS})(?![\\w-])))`,
    "gi",
  ),
];

const OUTSIDE = "A link goes outside the product's own site.";
const reject = (reason: string): SanitiseResult => ({ ok: false, reason });

function hostOf(target: string): string | null {
  if (!/^https?:\/\//i.test(target) || !URL.canParse(target)) return null;
  return new URL(target).hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Why a link in `text` is not allowed (every link, with or without a scheme, must go to one of
 * `hosts`), or null. The one check for links, shared by pieces and the source draft.
 */
export function linkProblem(text: string, hosts: readonly string[]): string | null {
  const targets = [
    ...text.matchAll(INLINE_LINK),
    ...text.matchAll(REFERENCE_LINK),
    ...text.matchAll(BARE_URL),
  ].map((match) => match[1] ?? match[0]);
  for (const target of targets) {
    const host = hostOf(target);
    if (host === null || !hosts.includes(host)) return OUTSIDE;
  }
  for (const pattern of BARE_HOSTS) {
    for (const match of text.matchAll(pattern)) {
      const host = (match[1] ?? "").toLowerCase().replace(/^www\./, "");
      if (!hosts.includes(host)) return OUTSIDE;
    }
  }
  return null;
}

function markdownProblem(text: string, hosts: readonly string[]): string | null {
  if (BAD_HEADING.test(text)) return "Only ## and ### headings are allowed.";
  if (BAD_BLOCK.test(text)) return "Quotes and tables are not allowed.";
  return linkProblem(text, hosts);
}

/**
 * Cleans text from an agent or the owner before it is checked or stored. Hidden characters are
 * stripped (and reported); anything that could carry markup, a tracking image or a second
 * frontmatter block is rejected, never silently fixed. `markdown` is the blog and website subset:
 * paragraphs, `##` and `###` headings, lists, emphasis and links to `allowedHosts`.
 */
export function sanitiseText(
  input: string,
  kind: "social" | "markdown",
  options: { allowedHosts?: readonly string[] } = {},
): SanitiseResult {
  const crlf = input.replace(/\r\n/g, "\n");
  const cleaned = crlf.replace(INVISIBLE_CHARS, "");
  const text = cleaned.normalize("NFC");
  if (CONTROL_CHARS.test(text)) return reject("It contains a control character.");
  if (HTML.test(text)) return reject("It contains HTML.");
  if (IMAGE.test(text)) return reject("It contains an image.");
  if (LINK_TITLE.test(text)) return reject("It contains a link title.");
  if (FENCE.test(text)) return reject("It contains a code fence.");
  if (FRONTMATTER_LINE.test(text)) return reject("It contains a line of three dashes.");
  const problem = kind === "markdown" ? markdownProblem(text, options.allowedHosts ?? []) : null;
  if (problem) return reject(problem);
  return { ok: true, text, stripped: cleaned !== crlf };
}

/** Content is a shallow object (a platform shape has at most four levels); deeper is hostile. */
export const MAX_DEPTH = 12;

/** True when `value` nests objects or arrays deeper than MAX_DEPTH (checked without recursing past it). */
export function isTooDeep(value: unknown, depth = 0): boolean {
  if (value === null || typeof value !== "object") return false;
  if (depth >= MAX_DEPTH) return true;
  return Object.values(value).some((v) => isTooDeep(v, depth + 1));
}

function mapStrings(
  value: unknown,
  path: string[],
  visit: (text: string, path: string[]) => string,
): unknown {
  if (typeof value === "string") return visit(value, path);
  if (Array.isArray(value)) return value.map((v, i) => mapStrings(v, [...path, String(i)], visit));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapStrings(v, [...path, k], visit)]),
    );
  }
  return value;
}

/**
 * Sanitises every text in a platform piece. Only a blog body may be markdown; every other text is
 * plain, and a link in any text must go to `allowedHosts`. A rejected text is named by a fixed
 * sentence, never by its content.
 */
export function sanitiseContent<T>(
  platform: Platform,
  content: T,
  allowedHosts: readonly string[],
): { ok: true; content: T; stripped: boolean } | { ok: false; reason: string } {
  let stripped = false;
  let failure: string | null = null;
  if (isTooDeep(content)) return { ok: false, reason: "It is nested too deeply." };
  const cleaned = mapStrings(content, [], (text, path) => {
    const markdown = platform === "blog" && path.join(".") === "body";
    const result = sanitiseText(text, markdown ? "markdown" : "social", { allowedHosts });
    const reason = result.ok
      ? markdown
        ? null
        : linkProblem(result.text, allowedHosts)
      : result.reason;
    if (reason !== null || !result.ok) {
      failure ??= reason ?? "It could not be read.";
      return text;
    }
    stripped ||= result.stripped;
    return result.text;
  });
  return failure === null
    ? { ok: true, content: cleaned as T, stripped }
    : { ok: false, reason: failure };
}
