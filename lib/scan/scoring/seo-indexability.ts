import type { Crawl, Readiness } from "./inputs";
import { measured, missing, plural, type SubScore } from "./sub-score";

type Sitemap = NonNullable<Readiness["sitemap"]>;
type SitemapError = Sitemap["errors"][number];

/** A part of the indexability mean, or why it is left out (a note, or a gap). */
type Part = { value: number | null; note: string | null; gaps: string[] };

const describe = (e: SitemapError) =>
  `${e.url}: ${e.status !== undefined ? `HTTP ${e.status}` : (e.kind ?? "error")}`;

/** Same-origin sitemaps that could not be fetched: unknown, never "invalid". */
const unfetched = (sitemap: Sitemap) =>
  sitemap.errors.filter((e) => e.kind !== "invalid" && e.kind !== "off_origin");

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
 * The sitemap part: 1 when every same-origin sitemap read parsed, 0 when one did not parse or
 * none is listed. Unfetchable sitemaps are a gap, and a sitemap only on another origin (Google
 * accepts those when robots.txt lists them) is left out with a note.
 */
function sitemapPart(sitemap: Sitemap): Part {
  const failed = unfetched(sitemap);
  if (sitemap.valid === false) {
    const bad = sitemap.errors.filter((e) => e.kind === "invalid").length;
    return { value: 0, note: `Sitemap invalid (${bad} did not parse)`, gaps: [] };
  }
  if (sitemap.valid === true) {
    const urls = sitemap.urlCount ?? 0;
    const note = `Sitemap valid (${sitemap.partial ? "at least " : ""}${urls} URLs)`;
    const gaps = sitemap.partial
      ? [
          `sitemap partial: ${failed.length} same-origin ${plural(failed.length, "sitemap")} ` +
            `could not be read (${failed.map(describe).join(", ")}), so the URL count covers ` +
            `only the ${sitemap.sitemapsRead} read`,
        ]
      : [];
    const also = offOriginNote(sitemap, true);
    return { value: 1, note: also ? `${note}; ${also}` : note, gaps };
  }
  if (failed.length > 0) {
    const gap = `sitemap could not be fetched (${failed.map(describe).join(", ")})`;
    return { value: null, note: null, gaps: [gap] };
  }
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
