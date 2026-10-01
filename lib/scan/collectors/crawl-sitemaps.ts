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

export type SitemapReading = {
  /** Sitemaps read successfully (a urlset or an index). */
  read: number;
  /** Unique same-origin page URLs listed; null when sitemaps exist but none could be read. */
  urls: string[] | null;
  errors: SitemapError[];
};

const MAX_SITEMAPS = 5;
/** Sitemap URLs considered at all (listed in robots.txt or an index), fetched or not. */
const MAX_CANDIDATES = 50;
const MAX_SITEMAP_URLS = 5_000;
const MAX_ERRORS = 5;
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
      for (const loc of sitemap.locs) enqueue(loc);
      continue;
    }
    urlsetsRead++;
    for (const loc of sitemap.locs.slice(0, MAX_SITEMAP_URLS - entries)) {
      entries++;
      const href = sameOriginHref(loc, origin);
      if (href) urls.add(href);
    }
  }
  const unreadable = urlsetsRead === 0 && errors.length > 0;
  return { read, urls: unreadable ? null : [...urls], errors };
}
