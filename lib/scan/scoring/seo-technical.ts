import type { Crawl } from "./inputs";
import { distinctPages, type HtmlPage, htmlPages } from "./pages";
import { measured, missing, type SubScore } from "./sub-score";

/** Google shows roughly this much of a title and a description in results. */
const TITLE_CHARS = { min: 10, max: 60 };
const DESCRIPTION_CHARS = { min: 50, max: 160 };
/** Points off per distinct broken link target, and the most broken links can take. */
const BROKEN_TARGET_POINTS = 5;
const MAX_BROKEN_PENALTY = 25;

const within = (n: number, range: { min: number; max: number }) => n >= range.min && n <= range.max;

/** A page that names another URL as canonical is a duplicate: its noindex is no problem. */
const isIndexable = (page: HtmlPage) => page.canonical === null || page.canonical === page.finalUrl;

/** The per-page HTML checks: each a share of pages (0–1), and how it reads in the evidence. */
function htmlChecks(html: readonly HtmlPage[]): { shares: number[]; evidence: string } {
  const count = (test: (page: HtmlPage) => boolean) => html.filter(test).length;
  const title = count((p) => within(p.titleLength, TITLE_CHARS));
  const description = count((p) => within(p.descriptionLength, DESCRIPTION_CHARS));
  const h1 = count((p) => p.h1Count === 1);
  const canonical = count((p) => p.canonical !== null);
  const shares = [title, description, h1, canonical].map((n) => n / html.length);
  let evidence =
    `Of ${html.length} HTML pages: ${title} have a 10–60 character title, ${description} a ` +
    `50–160 character description, ${h1} exactly one h1, ${canonical} a canonical link`;
  const indexable = html.filter(isIndexable);
  if (indexable.length > 0) {
    const noindex = indexable.filter((p) => p.noindex).length;
    shares.push(1 - noindex / indexable.length);
    evidence += `; ${noindex} of ${indexable.length} indexable pages are noindex`;
  }
  return { shares, evidence: `${evidence}.` };
}

/**
 * Technical health: the mean of the page checks (2xx share; then over HTML pages: title
 * length, description length, one h1, canonical, no noindex on indexable pages), less 5 points
 * per distinct broken internal link target (at most 25).
 */
export function technicalHealth(crawl: Crawl): SubScore {
  const pages = distinctPages(crawl.pages);
  if (pages.length === 0) return missing("The crawl recorded no pages");
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300).length;
  const shares = [ok / pages.length];
  const parts = [`${pages.length} pages crawled, ${ok} answered 2xx.`];
  const html = htmlPages(crawl.pages);
  if (html.length > 0) {
    const checks = htmlChecks(html);
    shares.push(...checks.shares);
    parts.push(checks.evidence);
  }
  const targets = new Set(crawl.site.brokenInternalLinks.map((link) => link.to)).size;
  const penalty = Math.min(MAX_BROKEN_PENALTY, targets * BROKEN_TARGET_POINTS);
  const plural = targets === 1 ? "target" : "targets";
  parts.push(`${targets} broken internal link ${plural} (−${penalty}).`);
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return measured(100 * mean - penalty, parts.join(" "));
}
