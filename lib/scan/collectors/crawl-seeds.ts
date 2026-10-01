import { FetchError } from "../fetch-error";
import { parseRobots } from "../robots";
import { parseSitemap } from "../sitemap";
import type { SafeFetch, SafeFetchResponse } from "../types";
import { sameOriginHref } from "./crawl-frontier";

/**
 * How robots.txt answered: read, absent (a 4xx: no rules), unavailable (429, 5xx or a network
 * failure), or redirecting where the crawler may not follow (treated as no rules).
 */
export type RobotsTxtState = "ok" | "missing" | "unavailable" | "unfollowable_redirect";

export type Seeds = {
  robotsTxt: RobotsTxtState;
  /** Sitemaps read successfully (a urlset or an index). */
  sitemapsRead: number;
  /** Unique same-origin page URLs listed in the sitemaps. */
  urls: string[];
};

const MAX_SITEMAPS = 5;
const MAX_SITEMAP_URLS = 5_000;
const ROBOTS_MAX_BYTES = 512 * 1024;
const SITEMAP_MAX_BYTES = 5 * 1024 * 1024;

/** The response, or the FetchError explaining why there is none; aborts still throw. */
async function attempt(
  run: () => Promise<SafeFetchResponse>,
  signal: AbortSignal,
): Promise<SafeFetchResponse | FetchError> {
  try {
    return await run();
  } catch (error) {
    if (signal.aborted || !(error instanceof FetchError)) throw error;
    return error;
  }
}

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

/** Reads up to 5 sitemaps (following indexes) and up to 5,000 listed URLs. */
async function readSitemaps(
  fetch: SafeFetch,
  origin: string,
  starts: readonly string[],
  signal: AbortSignal,
) {
  const queue = [
    ...new Set(starts.map((s) => sameOriginHref(s, origin)).filter((s) => s !== null)),
  ];
  const urls = new Set<string>();
  let fetched = 0;
  let read = 0;
  let listed = 0;
  while (fetched < MAX_SITEMAPS && fetched < queue.length && listed < MAX_SITEMAP_URLS) {
    const url = queue[fetched] ?? "";
    fetched++;
    const options = { maxBytes: SITEMAP_MAX_BYTES, accept: "application/xml", signal };
    const response = await attempt(() => fetch(url, options), signal);
    if (response instanceof FetchError || response.status < 200 || response.status >= 300) continue;
    const sitemap = parseSitemap(response.body);
    if (sitemap.kind === "invalid") continue;
    read++;
    for (const loc of sitemap.locs) {
      const href = sameOriginHref(loc, origin);
      if (sitemap.kind === "index") {
        // Only the first few sitemaps are ever read, so a huge index needn't be queued.
        if (href && queue.length < MAX_SITEMAPS && !queue.includes(href)) queue.push(href);
        continue;
      }
      if (listed >= MAX_SITEMAP_URLS) break;
      listed++;
      if (href) urls.add(href);
    }
  }
  return { read, urls: [...urls] };
}

/** Sitemap seeds for a crawl of `origin`: those robots.txt lists, then /sitemap.xml. */
export async function discoverSeeds(
  fetch: SafeFetch,
  origin: string,
  signal: AbortSignal,
): Promise<Seeds> {
  const robots = await readRobots(fetch, origin, signal);
  const starts = [...robots.sitemaps, `${origin}/sitemap.xml`];
  const sitemaps = await readSitemaps(fetch, origin, starts, signal);
  return { robotsTxt: robots.state, sitemapsRead: sitemaps.read, urls: sitemaps.urls };
}
