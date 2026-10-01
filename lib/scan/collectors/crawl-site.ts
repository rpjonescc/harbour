import type { FetchErrorKind } from "../fetch-error";
import type { RobotsTxtState } from "./crawl-seeds";
import type { SitemapError } from "./crawl-sitemaps";
import type { BrokenLink, DuplicateTitle } from "./crawl-summary";

/** The crawler's one `site` observation per scan (subject: the normalised product URL). */
export type CrawlSite = {
  /** Page observations recorded (robots-blocked and failed fetches are not pages). */
  pagesCrawled: number;
  /** Unique same-origin page URLs in the sitemaps; null when sitemaps exist but none could be read. */
  pagesInSitemap: number | null;
  /** Internal links to a 4xx/5xx page, sorted by target then source, at most 100. */
  brokenInternalLinks: BrokenLink[];
  /** Titles shared by distinct successful pages (by final URL), at most 50, 10 URLs each. */
  duplicateTitles: DuplicateTitle[];
  /** Mean page time in ms; null when no page was recorded. */
  avgMs: number | null;
  robotsTxt: RobotsTxtState;
  /** Sitemaps read successfully (urlsets and indexes), at most 5 fetched. */
  sitemapsRead: number;
  /** Sitemaps that could not be read, at most 5 (a 4xx on the default /sitemap.xml is absence). */
  sitemapErrors: SitemapError[];
  /** URLs robots.txt kept the crawler from requesting. */
  blockedByRobots: number;
  /** URLs that produced no response (timeouts, network errors, off-site redirects), at most 50. */
  fetchErrors: { url: string; kind: FetchErrorKind }[];
  /** Which budget stopped the crawl with URLs still queued; null when it ran out of URLs. */
  limitReached: "pages" | "bytes" | null;
};
