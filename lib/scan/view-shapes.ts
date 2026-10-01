import { z } from "zod";
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

const crawlSite = z.object({
  brokenInternalLinks: z.array(z.object({ from: z.string(), to: z.string(), status: z.number() })),
});

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
export type SiteFacts = z.infer<typeof crawlSite>;
export type ReadinessFacts = z.infer<typeof readiness> & { url: string };
export type GscMetricsFacts = z.infer<typeof gscMetrics> & { key: string };

/**
 * Observations of one kind that parse (and, with `urlSubject`, whose subject is a URL); anything
 * malformed is left out (a gap, not a zero).
 */
function read<T extends z.ZodType>(
  observations: readonly ScanObservation[],
  collector: string,
  kind: string,
  shape: T,
  urlSubject = false,
): { subject: string; value: z.infer<T> }[] {
  return observations.flatMap((o) => {
    if (o.collector !== collector || o.kind !== kind) return [];
    const parsed = shape.safeParse(o.value);
    if (!parsed.success || (urlSubject && !isHttpUrl(o.subject))) return [];
    return [{ subject: o.subject, value: parsed.data }];
  });
}

/** Crawled pages, once each by final URL (a redirect and its target are one page). */
export function crawledPages(observations: readonly ScanObservation[]): PageFacts[] {
  const seen = new Set<string>();
  return read(observations, "crawler", "page", crawledPage, true).flatMap(({ subject, value }) => {
    if (seen.has(value.finalUrl)) return [];
    seen.add(value.finalUrl);
    return [{ ...value, url: subject }];
  });
}

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
