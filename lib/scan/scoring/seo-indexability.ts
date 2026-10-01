import type { Crawl, Readiness } from "./inputs";
import { measured, missing, plural, type SubScore } from "./sub-score";

type Sitemap = NonNullable<Readiness["sitemap"]>;
type SitemapError = Sitemap["errors"][number];

/** A part of the indexability mean, or why it is left out (a note, or a gap). */
type Part = { value: number | null; note: string | null; gaps: string[] };

const describe = (e: SitemapError) =>
  `${e.url}: ${e.status !== undefined ? `HTTP ${e.status}` : (e.kind ?? "error")}`;

/** A listed sitemap answering a 4xx other than 429: a defect on the site, not an unknown. */
const isDefect = (e: SitemapError) =>
  e.status !== undefined && e.status >= 400 && e.status < 500 && e.status !== 429;

/** Unknown: a 5xx, a 429 or no response (a fetch error kind) — never "invalid". */
const isUnknown = (e: SitemapError) =>
  e.kind !== "invalid" && e.kind !== "off_origin" && !isDefect(e);

function unknownGap(unknown: readonly SitemapError[], read: number): string {
  const list = unknown.map(describe).join(", ");
  if (read === 0) return `sitemap could not be fetched (${list})`;
  return (
    `sitemap partial: ${unknown.length} same-origin ${plural(unknown.length, "sitemap")} ` +
    `could not be read (${list}), so the URL count covers only the ${read} read`
  );
}

/** "Sitemap on another origin, not checked (…)"; `also` for when one was read as well. */
function offOriginNote(sitemap: Sitemap, also = false): string | null {
  const urls = sitemap.offOrigin;
  if (urls.length === 0) return null;
  const what = also
    ? `also ${urls.length} ${plural(urls.length, "sitemap")}`
    : plural(urls.length, "Sitemap");
  return `${what} on another origin, not checked (${urls.join(", ")})`;
}

/**
 * The sitemap part: 1 when the same-origin sitemaps read all parsed; 0 when one did not parse,
 * a listed one answers a 4xx (not 429), or none is listed (the crawler treats a 4xx on the
 * default /sitemap.xml as absence). A sitemap that answered 5xx, 429 or nothing is unknown: a
 * gap, left out when none was read. One only on another origin (Google accepts those when
 * robots.txt lists them) is left out with a note.
 */
function sitemapPart(sitemap: Sitemap): Part {
  const unknown = sitemap.errors.filter(isUnknown);
  const gaps = unknown.length > 0 ? [unknownGap(unknown, sitemap.sitemapsRead)] : [];
  if (sitemap.valid === false) {
    const bad = sitemap.errors.filter((e) => e.kind === "invalid").length;
    return { value: 0, note: `Sitemap invalid (${bad} did not parse)`, gaps };
  }
  const defects = sitemap.errors.filter(isDefect);
  if (defects.length > 0) {
    const answers = defects.map((e) => `HTTP ${e.status} (${e.url})`).join(", ");
    return { value: 0, note: `Sitemap listed but answers ${answers}`, gaps };
  }
  if (sitemap.sitemapsRead > 0) {
    const urls = sitemap.urlCount ?? 0;
    const count = `${unknown.length > 0 ? "at least " : ""}${urls} ${plural(urls, "URL")}`;
    const also = offOriginNote(sitemap, true);
    return { value: 1, note: `Sitemap valid (${count})${also ? `; ${also}` : ""}`, gaps };
  }
  if (unknown.length > 0) return { value: null, note: null, gaps };
  const offOrigin = offOriginNote(sitemap);
  if (offOrigin) return { value: null, note: offOrigin, gaps: [] };
  return { value: 0, note: "No sitemap found on the site's origin", gaps: [] };
}

function googlebotPart(readiness: Readiness): Part {
  const access = readiness.robotsTxt.googlebot;
  if (access === null) {
    const gap = "robots.txt could not be read, so Googlebot's access is unknown";
    return { value: null, note: null, gaps: [gap] };
  }
  if (access === "blocked") return { value: 0, note: "robots.txt blocks Googlebot", gaps: [] };
  const some = access === "partial" ? " (some paths disallowed)" : "";
  return { value: 1, note: `Googlebot allowed${some}`, gaps: [] };
}

function reachPart(crawl: Crawl): Part {
  const reach = crawl.site.sitemapPages;
  if (!reach || reach.crawled === 0) return { value: null, note: null, gaps: [] };
  const note = `${reach.ok} of ${reach.crawled} crawled sitemap URLs answered 2xx`;
  return { value: reach.ok / reach.crawled, note, gaps: [] };
}

/**
 * Indexability: the mean of the parts that could be judged — sitemap (see `sitemapPart`),
 * robots.txt lets Googlebot reach "/" (1/0; some paths disallowed still counts as allowed) and
 * the share of crawled sitemap URLs that answered 2xx (left out when there were none).
 */
export function indexability(crawl: Crawl, readiness: Readiness): SubScore {
  const { sitemap } = readiness;
  if (!sitemap) return missing("Readiness could not read this scan's crawl: sitemap unknown");
  const parts = [sitemapPart(sitemap), googlebotPart(readiness), reachPart(crawl)];
  const values = parts.flatMap((p) => (p.value === null ? [] : [p.value]));
  const gaps = parts.flatMap((p) => p.gaps);
  if (values.length === 0) return missing(`Nothing to score: ${gaps.join("; ")}`);
  const notes = parts.flatMap((p) => (p.note === null ? [] : [p.note]));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return measured(100 * mean, `${notes.join("; ")}.`, gaps);
}
