import { FetchError } from "../fetch-error";
import type { CollectContext, Collector, CollectorResult, Observation } from "../types";
import { Frontier } from "./crawl-frontier";
import { type CrawledPage, pageFromResponse } from "./crawl-page";
import { discoverSeeds } from "./crawl-seeds";
import type { CrawlSite } from "./crawl-site";
import { sitemapPages, summarisePages } from "./crawl-summary";

export type CrawlLimits = {
  /** Total HTML bytes one crawl reads before it stops. */
  maxBytes: number;
};

const HTML_MAX_BYTES = 2 * 1024 * 1024;
const HTML_ACCEPT = "text/html,application/xhtml+xml";
const DEFAULT_LIMITS: CrawlLimits = { maxBytes: 64 * 1024 * 1024 };
/** Matches the shared host limiter's 2 per site: more would only queue inside it. */
const CONCURRENCY = 2;
const MAX_FETCH_ERRORS = 50;

type FetchFailure = CrawlSite["fetchErrors"][number];

type Crawl = {
  ctx: CollectContext;
  limits: CrawlLimits;
  maxPages: number;
  pages: Map<string, CrawledPage>;
  started: number;
  bytes: number;
  blockedByRobots: number;
  fetchErrors: FetchFailure[];
};

/** Fetches one page and records it; FetchErrors propagate. */
async function fetchPage(crawl: Crawl, url: string) {
  const response = await crawl.ctx.fetch(url, {
    maxBytes: HTML_MAX_BYTES,
    accept: HTML_ACCEPT,
    signal: crawl.ctx.signal,
  });
  crawl.bytes += Buffer.byteLength(response.body);
  const { page, links } = pageFromResponse(response);
  crawl.pages.set(url, page);
  return { finalUrl: response.finalUrl, links };
}

/** Visits one page; a fetch failure is recorded (not thrown) and yields null. */
async function visit(crawl: Crawl, url: string) {
  try {
    return await fetchPage(crawl, url);
  } catch (error) {
    if (crawl.ctx.signal.aborted || !(error instanceof FetchError)) throw error;
    if (error.kind === "blocked_by_robots") {
      crawl.blockedByRobots++;
      // robots.txt refused it before any request: it doesn't use up the page cap.
      crawl.started--;
    } else if (crawl.fetchErrors.length < MAX_FETCH_ERRORS) {
      crawl.fetchErrors.push({ url, kind: error.kind });
    }
    return null;
  }
}

function hasBudget(crawl: Crawl): boolean {
  return crawl.started < crawl.maxPages && crawl.bytes < crawl.limits.maxBytes;
}

/** Breadth-first over the frontier, two pages in flight, until it empties or a cap is hit. */
async function crawlFrontier(crawl: Crawl, frontier: Frontier): Promise<void> {
  const inFlight = new Set<Promise<void>>();
  // Bounded: every pass takes a URL off the bounded frontier or waits for a visit to finish.
  while (true) {
    crawl.ctx.signal.throwIfAborted();
    while (inFlight.size < CONCURRENCY && hasBudget(crawl)) {
      const url = frontier.next();
      if (url === undefined) break;
      crawl.started++;
      const task = visit(crawl, url).then((visited) => {
        if (!visited) return;
        // A redirect's target is the same page: don't fetch it again under its own URL.
        frontier.markKnown(visited.finalUrl);
        for (const link of visited.links) frontier.add(link, url);
      });
      inFlight.add(task);
      // Rejections surface through the race below; this only marks them handled.
      task.then(
        () => inFlight.delete(task),
        () => {},
      );
    }
    if (inFlight.size === 0) return;
    await Promise.race(inFlight);
  }
}

function limitReached(crawl: Crawl, frontier: Frontier): "pages" | "bytes" | null {
  if (!frontier.hasPending()) return null;
  if (crawl.bytes >= crawl.limits.maxBytes) return "bytes";
  return crawl.started >= crawl.maxPages ? "pages" : null;
}

/** Visits the product URL first: its final URL fixes the origin the crawl stays on. */
async function visitProduct(crawl: Crawl, url: string) {
  crawl.started++;
  try {
    const { finalUrl, links } = await fetchPage(crawl, url);
    return { finalUrl, origin: new URL(finalUrl).origin, links };
  } catch (error) {
    if (crawl.ctx.signal.aborted || !(error instanceof FetchError)) throw error;
    throw new Error(`Could not crawl ${url}: ${error.message}`, { cause: error });
  }
}

async function collect(ctx: CollectContext, limits: CrawlLimits): Promise<CollectorResult> {
  const crawl: Crawl = {
    ctx,
    limits,
    maxPages: ctx.config.HARBOUR_CRAWL_MAX_PAGES,
    pages: new Map(),
    started: 0,
    bytes: 0,
    blockedByRobots: 0,
    fetchErrors: [],
  };
  const start = new URL(ctx.product.url).href;
  const product = await visitProduct(crawl, start);
  const frontier = new Frontier(product.origin);
  frontier.markKnown(start);
  frontier.markKnown(product.finalUrl);
  // Seeds first (the product URL, then its sitemaps), then links breadth-first.
  const seeds = await discoverSeeds(ctx.fetch, product.origin, ctx.signal);
  for (const url of seeds.urls ?? []) frontier.add(url);
  for (const link of product.links) frontier.add(link, start);
  await crawlFrontier(crawl, frontier);

  const site: CrawlSite = {
    ...summarisePages(crawl.pages, (url) => frontier.referrersOf(url)),
    pagesInSitemap: seeds.urls?.length ?? null,
    sitemapLastmods: seeds.sitemapLastmods,
    robotsTxt: seeds.robotsTxt,
    sitemapsRead: seeds.sitemapsRead,
    sitemapErrors: seeds.sitemapErrors,
    sitemapPages: sitemapPages(seeds.urls, crawl.pages),
    blockedByRobots: crawl.blockedByRobots,
    fetchErrors: crawl.fetchErrors,
    limitReached: limitReached(crawl, frontier),
  };
  const stopped = site.limitReached ? ` (stopped at the ${site.limitReached} limit)` : "";
  ctx.log(`Crawled ${site.pagesCrawled} pages on ${product.origin}${stopped}`);
  const observations: Observation[] = [...crawl.pages].map(([subject, value]) => ({
    kind: "page",
    subject,
    value,
  }));
  observations.push({ kind: "site", subject: start, value: site });
  return { status: "ok", observations };
}

/** The crawler with its byte budget (tests shrink it). */
export function createCrawler(overrides: Partial<CrawlLimits> = {}): Collector {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  return { id: "crawler", cadence: "daily", collect: (ctx) => collect(ctx, limits) };
}

/** Crawls each product's own site: pages, links, titles, structured data. */
export const crawler: Collector = createCrawler();
