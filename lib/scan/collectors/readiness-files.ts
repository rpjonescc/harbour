import { FetchError, type FetchErrorKind } from "../fetch-error";
import {
  type AiCrawler,
  aiCrawlerAccess,
  type CrawlerAccess,
  crawlerAccess,
  parseRobots,
} from "../robots";
import type { SafeFetch, SafeFetchResponse } from "../types";
import type { RobotsTxtState } from "./crawl-seeds";
import { attempt } from "./fetch-attempt";

const TEXT_MAX_BYTES = 512 * 1024;

export type RobotsReadiness = {
  /** How /robots.txt answered (as the crawler reports it). */
  state: RobotsTxtState;
  /** Plain text with at least one user-agent group or sitemap line; null unless state is ok. */
  valid: boolean | null;
  /** Googlebot's access to "/" (search indexing); null when the rules could not be read. */
  googlebot: CrawlerAccess | null;
  /** Each AI crawler's access to "/"; null when the rules could not be read. */
  aiCrawlerAccess: Record<AiCrawler, CrawlerAccess> | null;
};

/** A well-known text file such as /llms.txt. */
export type TextFileReadiness = {
  /** Served as text with a 2xx; null when unknown (no response, 429 or 5xx). */
  present: boolean | null;
  status: number | null;
  /** Size in bytes (at least this much when truncated); null when absent. */
  bytes: number | null;
  /** Longer than the 512 KiB read. */
  truncated: boolean;
  error: FetchErrorKind | null;
};

const isOk = (status: number) => status >= 200 && status < 300;
const isUnknown = (status: number) => status === 429 || status >= 500;

/** An HTML page answering for a text file is a "soft 404" (often a single-page app's shell). */
function looksLikeHtml(response: SafeFetchResponse): boolean {
  const type = response.headers["content-type"] ?? "";
  return /html/i.test(type) || /^\s*<(!doctype|html)/i.test(response.body);
}

function get(fetch: SafeFetch, url: string, signal: AbortSignal, ignoreRobots?: true) {
  const options = { maxBytes: TEXT_MAX_BYTES, accept: "text/plain", signal, ignoreRobots };
  return attempt(() => fetch(url, options), signal);
}

/** The body's size; when truncated, the declared size if it is not compressed, else bytes read. */
function sizeOf(response: SafeFetchResponse): number {
  const read = Buffer.byteLength(response.body);
  const declared = response.headers["content-length"] ?? "";
  if (!response.truncated || response.headers["content-encoding"] || !/^\d+$/.test(declared)) {
    return read;
  }
  return Number(declared);
}

/** robots.txt presence, validity and what it allows the AI crawlers. */
export async function checkRobots(
  fetch: SafeFetch,
  origin: string,
  signal: AbortSignal,
): Promise<RobotsReadiness> {
  const response = await get(fetch, `${origin}/robots.txt`, signal, true);
  if (response instanceof FetchError) {
    const state = response.kind === "redirect" ? "unfollowable_redirect" : "unavailable";
    return { state, valid: null, googlebot: null, aiCrawlerAccess: null };
  }
  if (isUnknown(response.status)) {
    return { state: "unavailable", valid: null, googlebot: null, aiCrawlerAccess: null };
  }
  if (!isOk(response.status)) {
    // No robots.txt: every crawler may fetch everything.
    const none = parseRobots("");
    return {
      state: "missing",
      valid: null,
      googlebot: crawlerAccess(none, "Googlebot"),
      aiCrawlerAccess: aiCrawlerAccess(none),
    };
  }
  const robots = parseRobots(response.body);
  const hasContent = robots.groups.length > 0 || robots.sitemaps.length > 0;
  return {
    state: "ok",
    valid: hasContent && !looksLikeHtml(response),
    googlebot: crawlerAccess(robots, "Googlebot"),
    aiCrawlerAccess: aiCrawlerAccess(robots),
  };
}

/** Whether `origin` serves the text file at `path` (robots.txt rules apply). */
export async function checkTextFile(
  fetch: SafeFetch,
  origin: string,
  path: string,
  signal: AbortSignal,
): Promise<TextFileReadiness> {
  const response = await get(fetch, `${origin}${path}`, signal);
  if (response instanceof FetchError) {
    return { present: null, status: null, bytes: null, truncated: false, error: response.kind };
  }
  const { status, truncated } = response;
  const present = isUnknown(status) ? null : isOk(status) && !looksLikeHtml(response);
  if (!present) return { present, status, bytes: null, truncated: false, error: null };
  return { present, status, bytes: sizeOf(response), truncated, error: null };
}
