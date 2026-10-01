import { FetchError, type FetchErrorKind } from "../fetch-error";
import { parseSitemap } from "../sitemap";
import type { SafeFetch } from "../types";
import { sameOriginHref } from "./crawl-frontier";
import { attempt } from "./fetch-attempt";

/**
 * A sitemap that could not be read: an HTTP `status`, or a `kind` — a fetch failure, "invalid"
 * (neither a urlset nor an index) or "off_origin" (not on the crawled origin, so not fetched).
 */
export type SitemapError = { url: string } & (
  | { status: number }
  | { kind: FetchErrorKind | "invalid" | "off_origin" }
);

/** A listed page's `<lastmod>`, as ISO 8601. */
export type DatedUrl = { url: string; lastmod: string };

/** Sitemap `<lastmod>` dates: how many listed pages have a valid one, and the newest 50. */
export type SitemapLastmods = { dated: number; newest: DatedUrl[] };

export type SitemapReading = {
  /** Sitemaps read successfully (a urlset or an index). */
  read: number;
  /** Unique same-origin page URLs listed; null when sitemaps exist but none could be read. */
  urls: string[] | null;
  /** Null exactly when `urls` is. */
  lastmods: SitemapLastmods | null;
  errors: SitemapError[];
};

const MAX_SITEMAPS = 5;
/** Sitemap URLs considered at all (listed in robots.txt or an index), fetched or not. */
const MAX_CANDIDATES = 50;
const MAX_SITEMAP_URLS = 5_000;
const MAX_ERRORS = 5;
const MAX_NEWEST = 50;
const SITEMAP_MAX_BYTES = 5 * 1024 * 1024;

type Candidate = { url: string; isDefault: boolean };

/**
 * Reads up to 5 sitemaps (following indexes) and up to 5,000 listed URLs. A 4xx on the default
 * `/sitemap.xml` just means there is none; every other failure is recorded.
 */
export async function readSitemaps(
  fetch: SafeFetch,
  origin: string,
  listed: readonly string[],
  signal: AbortSignal,
): Promise<SitemapReading> {
  const queue: Candidate[] = [];
  const seen = new Set<string>();
  const enqueue = (raw: string, isDefault = false) => {
    const url = URL.canParse(raw, origin) ? new URL(raw, origin).href : raw;
    if (seen.has(url) || queue.length >= MAX_CANDIDATES) return;
    seen.add(url);
    queue.push({ url, isDefault });
  };
  for (const raw of listed) enqueue(raw);
  enqueue(`${origin}/sitemap.xml`, true);

  const urls = new Set<string>();
  const dated = new Map<string, number>();
  const errors: SitemapError[] = [];
  const fail = (error: SitemapError) => {
    if (errors.length < MAX_ERRORS) errors.push(error);
  };
  let fetched = 0;
  let read = 0;
  let urlsetsRead = 0;
  let entries = 0;
  for (const { url, isDefault } of queue) {
    if (fetched >= MAX_SITEMAPS || entries >= MAX_SITEMAP_URLS) break;
    if (!sameOriginHref(url, origin)) {
      fail({ url, kind: "off_origin" });
      continue;
    }
    fetched++;
    const options = { maxBytes: SITEMAP_MAX_BYTES, accept: "application/xml", signal };
    const response = await attempt(() => fetch(url, options), signal);
    if (response instanceof FetchError) {
      fail({ url, kind: response.kind });
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      const absent = isDefault && response.status >= 400 && response.status < 500;
      if (!absent) fail({ url, status: response.status });
      continue;
    }
    // An index's entries are sitemaps, of which only a few are ever read.
    const sitemap = parseSitemap(
      response.body,
      Math.max(MAX_SITEMAP_URLS - entries, MAX_CANDIDATES),
    );
    if (sitemap.kind === "invalid") {
      fail({ url, kind: "invalid" });
      continue;
    }
    read++;
    if (sitemap.kind === "index") {
      for (const { loc } of sitemap.entries) enqueue(loc);
      continue;
    }
    urlsetsRead++;
    for (const { loc, lastmod } of sitemap.entries.slice(0, MAX_SITEMAP_URLS - entries)) {
      entries++;
      const href = sameOriginHref(loc, origin);
      if (!href) continue;
      urls.add(href);
      const ms = lastmod === null ? Number.NaN : Date.parse(lastmod);
      if (!Number.isNaN(ms)) dated.set(href, Math.max(ms, dated.get(href) ?? ms));
    }
  }
  if (urlsetsRead === 0 && errors.length > 0) return { read, urls: null, lastmods: null, errors };
  return { read, urls: [...urls], lastmods: summariseLastmods(dated), errors };
}

/** How many URLs carry a lastmod, and the newest 50 (ties by URL, for a stable order). */
function summariseLastmods(dated: ReadonlyMap<string, number>): SitemapLastmods {
  const newest = [...dated]
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, MAX_NEWEST)
    .map(([url, ms]) => ({ url, lastmod: new Date(ms).toISOString() }));
  return { dated: dated.size, newest };
}
