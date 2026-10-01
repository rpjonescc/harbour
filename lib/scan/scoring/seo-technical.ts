import type { Crawl } from "./inputs";
import { distinctPages, type HtmlPage, htmlPages } from "./pages";
import { measured, missing, plural, type SubScore, short } from "./sub-score";

/** Google shows roughly this much of a title and a description in results. */
const TITLE_CHARS = { min: 10, max: 60 };
const DESCRIPTION_CHARS = { min: 50, max: 160 };
/**
 * Most points broken links can take, scaled by the share of pages that link to a broken page.
 * The broken pages themselves already count against the 2xx share; this is the other half of
 * the problem (pages sending readers and crawlers to them), so it scales with site size.
 */
const MAX_BROKEN_PENALTY = 25;

const within = (n: number, range: { min: number; max: number }) => n >= range.min && n <= range.max;

/** A URL for comparing canonicals: no fragment, no trailing slash (the query stays). */
function comparable(url: string): string {
  if (!URL.canParse(url)) return url;
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.href;
}

/** A page that names another URL as canonical is a duplicate: its noindex is no problem. */
const isIndexable = (page: HtmlPage) =>
  page.canonical === null || comparable(page.canonical) === comparable(page.finalUrl);

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
    const verb = plural(noindex, "is", "are");
    evidence += `; ${noindex} of ${indexable.length} indexable pages ${verb} noindex`;
  }
  return { shares, evidence: `${evidence}.` };
}

/**
 * Technical health: the mean of the page checks (2xx share; then over HTML pages: title
 * length, description length, one h1, canonical, no noindex on indexable pages), less up to
 * 25 points scaled by the share of pages that link to a broken internal page.
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
  const linking = new Set(crawl.site.brokenInternalLinks.map((link) => link.from)).size;
  const penalty = MAX_BROKEN_PENALTY * Math.min(1, linking / pages.length);
  const verb = plural(linking, "links", "link");
  parts.push(
    `${linking} of ${pages.length} pages ${verb} to a broken internal page (−${short(penalty)}).`,
  );
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return measured(100 * mean - penalty, parts.join(" "));
}
