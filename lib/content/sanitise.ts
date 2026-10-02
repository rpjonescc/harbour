export type SanitiseResult =
  | { ok: true; text: string; stripped: boolean }
  | { ok: false; reason: string };

// Zero-width, bidi, joiner, BOM, soft-hyphen, variation-selector, line-separator and Unicode tag
// characters hide or reorder text. They are stripped before normalising so they cannot split a
// character sequence and survive as a different one.
const INVISIBLE =
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping combining and joining characters individually is the point.
  /[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u00ad\u061c\u180e\u034f\ufe00-\ufe0f]|[\u{e0000}-\u{e007f}]/gu;
// C0 and C1 controls and DEL; newline is the one allowed.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
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

const reject = (reason: string): SanitiseResult => ({ ok: false, reason });

function hostOf(target: string): string | null {
  if (!/^https?:\/\//i.test(target) || !URL.canParse(target)) return null;
  return new URL(target).hostname.toLowerCase().replace(/^www\./, "");
}

function markdownProblem(text: string, hosts: readonly string[]): string | null {
  if (BAD_HEADING.test(text)) return "Only ## and ### headings are allowed.";
  if (BAD_BLOCK.test(text)) return "Quotes and tables are not allowed.";
  const targets = [
    ...text.matchAll(INLINE_LINK),
    ...text.matchAll(REFERENCE_LINK),
    ...text.matchAll(BARE_URL),
  ].map((match) => match[1] ?? match[0]);
  for (const target of targets) {
    const host = hostOf(target);
    if (host === null || !hosts.includes(host))
      return "A link goes outside the product's own site.";
  }
  return null;
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
  const cleaned = crlf.replace(INVISIBLE, "");
  const text = cleaned.normalize("NFC");
  if (CONTROL.test(text)) return reject("It contains a control character.");
  if (HTML.test(text)) return reject("It contains HTML.");
  if (IMAGE.test(text)) return reject("It contains an image.");
  if (LINK_TITLE.test(text)) return reject("It contains a link title.");
  if (FENCE.test(text)) return reject("It contains a code fence.");
  if (FRONTMATTER_LINE.test(text)) return reject("It contains a line of three dashes.");
  const problem = kind === "markdown" ? markdownProblem(text, options.allowedHosts ?? []) : null;
  if (problem) return reject(problem);
  return { ok: true, text, stripped: cleaned !== crlf };
}
