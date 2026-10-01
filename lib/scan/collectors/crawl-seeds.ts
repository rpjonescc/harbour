import { FetchError } from "../fetch-error";
import { parseRobots } from "../robots";
import type { SafeFetch } from "../types";
import { readSitemaps, type SitemapError } from "./crawl-sitemaps";
import { attempt } from "./fetch-attempt";

/**
 * How robots.txt answered: read, absent (a 4xx: no rules), unavailable (429, 5xx or a network
 * failure), or redirecting where the crawler may not follow (treated as no rules).
 */
export type RobotsTxtState = "ok" | "missing" | "unavailable" | "unfollowable_redirect";

export type Seeds = {
  robotsTxt: RobotsTxtState;
  /** Sitemaps read successfully (a urlset or an index). */
  sitemapsRead: number;
  /** Unique same-origin page URLs listed in the sitemaps; null when none could be read. */
  urls: string[] | null;
  sitemapErrors: SitemapError[];
};

const ROBOTS_MAX_BYTES = 512 * 1024;

async function readRobots(fetch: SafeFetch, origin: string, signal: AbortSignal) {
  const url = `${origin}/robots.txt`;
  const options = { maxBytes: ROBOTS_MAX_BYTES, accept: "text/plain", signal } as const;
  const response = await attempt(() => fetch(url, { ...options, ignoreRobots: true }), signal);
  if (response instanceof FetchError) {
    const state = response.kind === "redirect" ? "unfollowable_redirect" : "unavailable";
    return { state, sitemaps: [] } as const;
  }
  const { status, body } = response;
  if (status >= 200 && status < 300) {
    return { state: "ok", sitemaps: parseRobots(body).sitemaps } as const;
  }
  return {
    state: status === 429 || status >= 500 ? "unavailable" : "missing",
    sitemaps: [],
  } as const;
}

/** Sitemap seeds for a crawl of `origin`: those robots.txt lists, then /sitemap.xml. */
export async function discoverSeeds(
  fetch: SafeFetch,
  origin: string,
  signal: AbortSignal,
): Promise<Seeds> {
  const robots = await readRobots(fetch, origin, signal);
  const sitemaps = await readSitemaps(fetch, origin, robots.sitemaps, signal);
  return {
    robotsTxt: robots.state,
    sitemapsRead: sitemaps.read,
    urls: sitemaps.urls,
    sitemapErrors: sitemaps.errors,
  };
}
