import { z } from "zod";
import type { IndexState } from "./index-shapes";
import { indexStatusValue, indexSummaryValue } from "./index-shapes";
import type { ScanObservation } from "./types";

// The observation fields the UI reads, validated at the boundary: stored JSON is external data.
// Each mirrors the collector's own type (CrawledPage, CrawlSite, Readiness, GscMetrics).

// Stored URLs are parsed later (paths, robots.txt location) and rendered as links: anything that
// isn't a well-formed http(s) URL is skipped here.
const isHttpUrl = (value: string) => /^https?:$/.test(URL.parse(value)?.protocol ?? "");
const url = z.string().refine(isHttpUrl);

const crawledPage = z.object({
  status: z.number(),
  finalUrl: url,
  title: z.string().nullable(),
  titleLength: z.number().nullable(),
  descriptionLength: z.number().nullable(),
  h1Count: z.number().nullable(),
  noindex: z.boolean().nullable(),
  hasFaqMarkup: z.boolean().nullable(),
});

const crawlSite = z
  .object({
    brokenInternalLinks: z.array(
      z.object({ from: z.string(), to: z.string(), status: z.number() }),
    ),
    limitReached: z.enum(["pages", "bytes"]).nullable(),
    fetchErrors: z.array(z.unknown()),
    blockedByRobots: z.number(),
  })
  .transform(({ fetchErrors, ...site }) => ({ ...site, fetchErrors: fetchErrors.length }));

const readiness = z.object({
  robotsTxt: z.object({
    aiCrawlerAccess: z.record(z.string(), z.enum(["allowed", "blocked", "partial"])).nullable(),
  }),
  llmsTxt: z.object({ present: z.boolean().nullable() }),
  schema: z
    .object({ pagesChecked: z.number(), pagesWith: z.object({ FAQPage: z.number() }) })
    .nullable(),
  preferredSources: z.object({ button: z.boolean() }).nullable(),
});

const gscMetrics = z.object({
  clicks: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  position: z.number(),
});

const gscSummary = z.object({ startDate: z.string(), endDate: z.string() });

export type PageFacts = z.infer<typeof crawledPage> & { url: string };
/** The crawl's summary; `fetchErrors` is how many URLs produced no response (capped at 50). */
export type SiteFacts = z.infer<typeof crawlSite>;
export type ReadinessFacts = z.infer<typeof readiness> & { url: string };
export type GscMetricsFacts = z.infer<typeof gscMetrics> & { key: string };

type Read<T extends z.ZodType> = { subject: string; value: z.output<T> };

/**
 * Observations of one kind that parse (and, with `urlSubject`, whose subject is a URL), and how
 * many of that kind did not: anything malformed is left out (a gap, not a zero).
 */
function readCounted<T extends z.ZodType>(
  observations: readonly ScanObservation[],
  collector: string,
  kind: string,
  shape: T,
  urlSubject = false,
): { rows: Read<T>[]; unreadable: number } {
  const rows: Read<T>[] = [];
  let unreadable = 0;
  for (const o of observations) {
    if (o.collector !== collector || o.kind !== kind) continue;
    const parsed = shape.safeParse(o.value);
    if (!parsed.success || (urlSubject && !isHttpUrl(o.subject))) unreadable++;
    else rows.push({ subject: o.subject, value: parsed.data });
  }
  return { rows, unreadable };
}

function read<T extends z.ZodType>(
  observations: readonly ScanObservation[],
  collector: string,
  kind: string,
  shape: T,
  urlSubject = false,
): Read<T>[] {
  return readCounted(observations, collector, kind, shape, urlSubject).rows;
}

/**
 * Crawled pages, once each by final URL (a redirect and its target are one page), and how many
 * page records could not be read.
 */
export function crawlPageFacts(observations: readonly ScanObservation[]): {
  pages: PageFacts[];
  unreadable: number;
} {
  const { rows, unreadable } = readCounted(observations, "crawler", "page", crawledPage, true);
  const seen = new Set<string>();
  const pages = rows.flatMap(({ subject, value }) => {
    if (seen.has(value.finalUrl)) return [];
    seen.add(value.finalUrl);
    return [{ ...value, url: subject }];
  });
  return { pages, unreadable };
}

/** Crawled pages, once each by final URL (a redirect and its target are one page). */
export const crawledPages = (observations: readonly ScanObservation[]): PageFacts[] =>
  crawlPageFacts(observations).pages;

/** A 2xx page with HTML facts to judge. */
export const isHtmlPage = (page: PageFacts) =>
  page.status >= 200 && page.status < 300 && page.titleLength !== null;

export function crawlSiteFacts(observations: readonly ScanObservation[]): SiteFacts | null {
  return read(observations, "crawler", "site", crawlSite)[0]?.value ?? null;
}

export function readinessFacts(observations: readonly ScanObservation[]): ReadinessFacts | null {
  const found = read(observations, "readiness", "readiness", readiness, true)[0];
  return found ? { ...found.value, url: found.subject } : null;
}

/** Search Console rows of one report kind (gsc_daily, gsc_query…) keyed by their subject. */
export function gscRows(observations: readonly ScanObservation[], kind: string): GscMetricsFacts[] {
  return read(observations, "search-console", kind, gscMetrics).map(({ subject, value }) => ({
    ...value,
    key: subject,
  }));
}

export function gscWindow(
  observations: readonly ScanObservation[],
): z.infer<typeof gscSummary> | null {
  return read(observations, "search-console", "gsc_summary", gscSummary)[0]?.value ?? null;
}

/** What Google says about the sitemap pages, as the rules and the product page read it. */
export type CoverageFacts = {
  /** Every page with a status, once each; "unknown" ones could not be checked. */
  pages: { url: string; state: IndexState }[];
  summary: z.infer<typeof indexSummaryValue>;
  /** The newest check behind any status: "now" for the rules, which have no clock of their own. */
  asOf: string | null;
};

/** The indexing check's pages and summary; null without a readable summary (a gap, not a zero). */
export function indexCoverageFacts(observations: readonly ScanObservation[]): CoverageFacts | null {
  const summary = read(observations, "indexing", "index_summary", indexSummaryValue)[0]?.value;
  if (!summary) return null;
  const rows = read(observations, "indexing", "index_status", indexStatusValue, true);
  const seen = new Set<string>();
  const pages = rows.flatMap(({ subject, value }) => {
    if (seen.has(subject)) return [];
    seen.add(subject);
    return [{ url: subject, state: value.state }];
  });
  const times = rows.flatMap(({ value }) =>
    value.state === "unknown" ? [] : [Date.parse(value.checkedAt)],
  );
  const asOf = times.length === 0 ? null : new Date(Math.max(...times)).toISOString();
  return { pages, summary, asOf };
}
