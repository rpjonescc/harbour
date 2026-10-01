import { z } from "zod";
import { FETCH_ERROR_KINDS } from "../fetch-error";
import { hasSchemaFamily, SCHEMA_FAMILIES, type SchemaFamily } from "../schema-types";
import type { Observation } from "../types";
import type { SitemapError } from "./crawl-sitemaps";

const DAY_MS = 24 * 60 * 60_000;
/** "Fresh" means updated or published in the last 30 days. */
const FRESH_WINDOW_MS = 30 * DAY_MS;
/** A date up to a day ahead is a time zone difference, not a future date. */
const FUTURE_SLACK_MS = DAY_MS;
/** Google's Preferred Sources guidance looks for a section of recent content: 3+ items. */
const FRESH_CONTENT_MIN = 3;
const MAX_BUTTON_PAGES = 10;

/** The sitemaps the crawler read; from its `site` observation. */
export type SitemapReadiness = {
  /** At least one sitemap was read. */
  reachable: boolean;
  /** Every fetched sitemap parsed; null when there is no sitemap to judge. */
  valid: boolean | null;
  sitemapsRead: number;
  /** Listed same-origin page URLs; null when no sitemap could be read. */
  urlCount: number | null;
  /** Some sitemaps failed, so `urlCount` misses their URLs. */
  partial: boolean;
  errors: SitemapError[];
  /** Listed sitemaps on another origin (often the apex's, listed by a www site): not read. */
  offOrigin: string[];
  /** URLs with a valid `<lastmod>`. */
  datedUrls: number | null;
  newestLastmod: string | null;
  /** URLs whose `<lastmod>` is in the last 30 days (counted among the newest 50). */
  modifiedLast30Days: number | null;
};

/** How many distinct crawled HTML pages carry each schema.org family. */
export type SchemaReadiness = {
  pagesChecked: number;
  pagesWith: Record<SchemaFamily, number>;
};

export type PreferredSourcesReadiness = {
  /** Some crawled page links to Google's Preferred Sources deeplink. */
  button: boolean;
  /** Those pages (final URLs, sorted, at most 10). */
  buttonPages: string[];
  /** URLs with a sitemap `<lastmod>` or Article `datePublished` in the last 30 days. */
  freshUrls: number;
  /** At least 3 fresh URLs. */
  freshContent: boolean;
};

/** Readiness drawn from this scan's crawl; each part null when there was no crawl to read. */
export type CrawlReadiness = {
  sitemap: SitemapReadiness | null;
  schema: SchemaReadiness | null;
  preferredSources: PreferredSourcesReadiness | null;
};

// The fields readiness reads from the crawler's observations (CrawlSite, CrawledPage).
const crawlSite = z.object({
  pagesInSitemap: z.number().nullable(),
  sitemapsRead: z.number(),
  sitemapErrors: z.array(
    z.union([
      z.object({ url: z.string(), status: z.number() }),
      z.object({ url: z.string(), kind: z.enum([...FETCH_ERROR_KINDS, "invalid", "off_origin"]) }),
    ]),
  ),
  sitemapLastmods: z
    .object({
      dated: z.number(),
      newest: z.array(z.object({ url: z.string(), lastmod: z.string() })),
    })
    .nullable(),
});

const crawledPage = z.object({
  finalUrl: z.string(),
  jsonLdTypes: z.array(z.string()).nullable(),
  hasFaqMarkup: z.boolean().nullable(),
  articleDatePublished: z.string().nullable(),
  preferredSourcesLink: z.boolean().nullable(),
});

type CrawlSiteFields = z.infer<typeof crawlSite>;
/** Pages with HTML facts, one per final URL. */
type HtmlPage = z.infer<typeof crawledPage> & { jsonLdTypes: string[] };

function isFresh(iso: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(iso);
  return age <= FRESH_WINDOW_MS && age >= -FUTURE_SLACK_MS;
}

function sitemapOf(site: CrawlSiteFields, now: Date): SitemapReadiness {
  const { pagesInSitemap, sitemapsRead, sitemapErrors: errors, sitemapLastmods } = site;
  const offOrigin = errors.flatMap((e) => ("kind" in e && e.kind === "off_origin" ? [e.url] : []));
  const invalid = errors.some((e) => "kind" in e && e.kind === "invalid");
  const judged = sitemapsRead > 0 || errors.length > offOrigin.length;
  return {
    reachable: sitemapsRead > 0,
    valid: judged ? sitemapsRead > 0 && !invalid : null,
    sitemapsRead,
    urlCount: pagesInSitemap,
    partial: pagesInSitemap !== null && errors.length > 0,
    errors,
    offOrigin,
    datedUrls: sitemapLastmods?.dated ?? null,
    newestLastmod: sitemapLastmods?.newest[0]?.lastmod ?? null,
    modifiedLast30Days:
      sitemapLastmods?.newest.filter((entry) => isFresh(entry.lastmod, now)).length ?? null,
  };
}

function schemaOf(pages: readonly HtmlPage[]): SchemaReadiness {
  const families = Object.keys(SCHEMA_FAMILIES) as SchemaFamily[];
  const entries = families.map((family): [SchemaFamily, number] => {
    const has = (p: HtmlPage) =>
      hasSchemaFamily(p.jsonLdTypes, family) || (family === "FAQPage" && p.hasFaqMarkup === true);
    return [family, pages.filter(has).length];
  });
  return {
    pagesChecked: pages.length,
    pagesWith: Object.fromEntries(entries) as Record<SchemaFamily, number>,
  };
}

function preferredSourcesOf(
  pages: readonly HtmlPage[],
  site: CrawlSiteFields,
  now: Date,
): PreferredSourcesReadiness {
  const buttonPages = pages
    .filter((p) => p.preferredSourcesLink === true)
    .map((p) => p.finalUrl)
    .sort()
    .slice(0, MAX_BUTTON_PAGES);
  const fresh = new Set<string>();
  for (const entry of site.sitemapLastmods?.newest ?? []) {
    if (isFresh(entry.lastmod, now)) fresh.add(entry.url);
  }
  for (const p of pages) {
    if (p.articleDatePublished !== null && isFresh(p.articleDatePublished, now)) {
      fresh.add(p.finalUrl);
    }
  }
  return {
    button: buttonPages.length > 0,
    buttonPages,
    freshUrls: fresh.size,
    freshContent: fresh.size >= FRESH_CONTENT_MIN,
  };
}

/** Distinct HTML pages by final URL (a redirect and its target are one page). */
function htmlPages(observations: readonly Observation[]): HtmlPage[] {
  const byUrl = new Map<string, HtmlPage>();
  for (const o of observations) {
    if (o.kind !== "page") continue;
    const page = crawledPage.parse(o.value);
    if (page.jsonLdTypes === null || byUrl.has(page.finalUrl)) continue;
    byUrl.set(page.finalUrl, { ...page, jsonLdTypes: page.jsonLdTypes });
  }
  return [...byUrl.values()];
}

/**
 * Sitemap, structured data and Preferred Sources readiness from the crawler's observations of
 * this scan. Without its `site` observation (the crawl failed or didn't run) all are unknown.
 */
export function readCrawl(observations: readonly Observation[], now: Date): CrawlReadiness {
  const siteObservation = observations.find((o) => o.kind === "site");
  if (!siteObservation) return { sitemap: null, schema: null, preferredSources: null };
  const site = crawlSite.parse(siteObservation.value);
  const pages = htmlPages(observations);
  return {
    sitemap: sitemapOf(site, now),
    schema: schemaOf(pages),
    preferredSources: preferredSourcesOf(pages, site, now),
  };
}
