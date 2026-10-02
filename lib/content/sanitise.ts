export type SanitiseResult =
  | { ok: true; text: string; stripped: boolean }
  | { ok: false; reason: string };

// Zero-width, bidi-override, word-joiner, BOM and soft-hyphen characters hide or reorder text.
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;
// C0 controls and DEL; newline is the one allowed.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const HTML = /<\/?[a-z][^>]*>|<!--/i;
const IMAGE = /!\[/;
const LINK_TITLE = /\]\([^)]*\s["'][^)]*\)/;
const FENCE = /^\s*(?:```|~~~)/m;
const FRONTMATTER_LINE = /^\s*---\s*$/m;
const LINK = /\]\(([^)\s]*)\)/g;
const BAD_HEADING = /^(?:#(?!#)|#{4,})\s/m;
const BAD_BLOCK = /^\s*(?:>|\|)/m;

const reject = (reason: string): SanitiseResult => ({ ok: false, reason });

function hostOf(target: string): string | null {
  if (!/^https?:\/\//i.test(target) || !URL.canParse(target)) return null;
  return new URL(target).hostname.toLowerCase().replace(/^www\./, "");
}

function markdownProblem(text: string, hosts: readonly string[]): string | null {
  if (BAD_HEADING.test(text)) return "Only ## and ### headings are allowed.";
  if (BAD_BLOCK.test(text)) return "Quotes and tables are not allowed.";
  for (const [, target = ""] of text.matchAll(LINK)) {
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
  const normal = input.normalize("NFC").replace(/\r\n/g, "\n");
  const text = normal.replace(INVISIBLE, "");
  if (CONTROL.test(text)) return reject("It contains a control character.");
  if (HTML.test(text)) return reject("It contains HTML.");
  if (IMAGE.test(text)) return reject("It contains an image.");
  if (LINK_TITLE.test(text)) return reject("It contains a link title.");
  if (FENCE.test(text)) return reject("It contains a code fence.");
  if (FRONTMATTER_LINE.test(text)) return reject("It contains a line of three dashes.");
  const problem = kind === "markdown" ? markdownProblem(text, options.allowedHosts ?? []) : null;
  if (problem) return reject(problem);
  return { ok: true, text, stripped: text !== normal };
}
