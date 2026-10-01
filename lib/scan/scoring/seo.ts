import type { Crawl, Readiness, SearchConsole, Vitals } from "./inputs";
import { technicalHealth } from "./seo-technical";
import { measured, missing, type SubScore, type SubScoreSpec, withSources } from "./sub-score";

/** Google's INP thresholds (p75): good up to 200 ms, poor from 500 ms. */
const INP_GOOD_MS = 200;
const INP_POOR_MS = 500;
/** Flat impressions score 75; +33% or more scores 100; a full drop scores 0. */
const FLAT_TREND = 75;

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function sitemapPart(sitemap: NonNullable<Readiness["sitemap"]>): { value: number; note: string } {
  if (sitemap.valid === true) {
    const urls = sitemap.urlCount ?? 0;
    const count = sitemap.partial ? `at least ${urls}` : `${urls}`;
    return { value: 1, note: `Sitemap valid (${count} URLs)` };
  }
  if (sitemap.valid === false) return { value: 0, note: "Sitemap invalid" };
  return { value: 0, note: "No sitemap found on the site's origin" };
}

/**
 * Indexability: the mean of sitemap valid (1/0), robots.txt lets Googlebot reach "/" (1/0;
 * some paths disallowed still counts as allowed) and the share of crawled sitemap URLs that
 * answered 2xx (left out when the sitemap had none to crawl).
 */
export function indexability(crawl: Crawl, readiness: Readiness): SubScore {
  const { sitemap } = readiness;
  if (!sitemap) return missing("Readiness could not read this scan's crawl: sitemap unknown");
  const gaps: string[] = [];
  const first = sitemapPart(sitemap);
  const parts = [first.value];
  const notes = [first.note];
  if (sitemap.partial) {
    const failed = sitemap.errors.length;
    gaps.push(
      `sitemap partial: ${failed} sitemap${failed === 1 ? "" : "s"} could not be read, so the ` +
        `URL count covers only the ${sitemap.sitemapsRead} read`,
    );
  }
  const googlebot = readiness.robotsTxt.googlebot;
  if (googlebot === null) {
    gaps.push("robots.txt could not be read, so Googlebot's access is unknown");
  } else {
    parts.push(googlebot === "blocked" ? 0 : 1);
    const some = googlebot === "partial" ? " (some paths disallowed)" : "";
    notes.push(
      googlebot === "blocked" ? "robots.txt blocks Googlebot" : `Googlebot allowed${some}`,
    );
  }
  const reach = crawl.site.sitemapPages;
  if (reach && reach.crawled > 0) {
    parts.push(reach.ok / reach.crawled);
    notes.push(`${reach.ok} of ${reach.crawled} crawled sitemap URLs answered 2xx`);
  }
  return measured(100 * mean(parts), `${notes.join("; ")}.`, gaps);
}

function inpScore(ms: number): number {
  if (ms <= INP_GOOD_MS) return 100;
  if (ms >= INP_POOR_MS) return 0;
  return (100 * (INP_POOR_MS - ms)) / (INP_POOR_MS - INP_GOOD_MS);
}

/**
 * Core Web Vitals: the Lighthouse mobile performance score, averaged with field INP (Chrome UX
 * Report, rated 100 at ≤ 200 ms down to 0 at ≥ 500 ms) when Google has field data.
 */
export function coreWebVitals(vitals: Vitals): SubScore {
  const from = vitals.measuredOn ? `PageSpeed from ${vitals.measuredOn}` : "PageSpeed this scan";
  const field = vitals.fieldDataAvailable ? vitals.inpMs : null;
  const lab = vitals.performanceScore;
  if (lab === null && field === null) return missing(`${from}: no performance score or field INP`);
  const parts: number[] = [];
  const notes: string[] = [];
  if (lab !== null) {
    parts.push(lab);
    notes.push(`mobile performance ${lab}`);
  }
  if (field !== null) {
    const rated = inpScore(field);
    parts.push(rated);
    notes.push(`field INP ${field} ms (rated ${Math.round(rated)})`);
  } else {
    notes.push("no field data");
  }
  return measured(mean(parts), `${from}: ${notes.join(", ")}.`);
}

function signedPercent(change: number): string {
  const percent = (change * 100).toFixed(1);
  return change >= 0 ? `+${percent}%` : `−${percent.slice(1)}%`;
}

/**
 * Search Console visibility: impressions in the 28-day window against the 28 days before.
 * 75 + 75 × change, so flat is 75, +33% or more is 100 and a full drop is 0.
 */
export function searchVisibility(search: SearchConsole): SubScore {
  const { impressions: now, priorImpressions: before } = search;
  if (before === 0) {
    return now === 0
      ? measured(0, "No impressions in the last 28 days or the 28 days before.")
      : measured(100, `${now} impressions in the last 28 days, none in the 28 days before.`);
  }
  const change = (now - before) / before;
  const evidence =
    `${now} impressions in the last 28 days vs ${before} in the 28 days before ` +
    `(${signedPercent(change)}).`;
  return measured(FLAT_TREND + FLAT_TREND * change, evidence);
}

/** SEO sub-scores of formula v1; weights sum to 1. */
export const SEO_SUB_SCORES: readonly SubScoreSpec[] = [
  {
    key: "seo.technical",
    label: "Technical health",
    weight: 0.35,
    measure: (i) => withSources([i.crawl], technicalHealth),
  },
  {
    key: "seo.indexability",
    label: "Indexability",
    weight: 0.25,
    measure: (i) => withSources([i.crawl, i.readiness], indexability),
  },
  {
    key: "seo.cwv",
    label: "Core Web Vitals",
    weight: 0.2,
    measure: (i) => withSources([i.vitals], coreWebVitals),
  },
  {
    key: "seo.visibility",
    label: "Search Console visibility",
    weight: 0.2,
    measure: (i) => withSources([i.searchConsole], searchVisibility),
  },
];
