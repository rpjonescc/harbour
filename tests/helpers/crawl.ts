import { getConfig } from "@/lib/config";
import type { Product } from "@/lib/products/catalog";
import { crawler } from "@/lib/scan/collectors/crawler";
import { createSafeFetch } from "@/lib/scan/fetch";
import { HostLimiter } from "@/lib/scan/host-limiter";
import type { CollectContext, Observation } from "@/lib/scan/types";
import { text } from "./http-site";

/** A route answering with a minimal HTML page. */
export const html = (body: string, headers: Record<string, string> = {}) =>
  text(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    "content-type": "text/html",
    ...headers,
  });

/** A crawl of a product at `url` on a local test site: loopback allowed, 1 ms spacing. */
export function crawlContext(url: string, overrides: Partial<CollectContext> = {}, maxPages = 200) {
  const product: Product = { id: "acme-docs", name: "Acme Docs", url, hue: "amber" };
  const ctx: CollectContext = {
    product,
    config: { ...getConfig(), HARBOUR_CRAWL_MAX_PAGES: maxPages },
    now: new Date("2026-10-01T06:00:00Z"),
    fetch: createSafeFetch({
      allowedHosts: new Set(["127.0.0.1"]),
      allowLoopback: true,
      timeoutMs: 5_000,
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 1 }),
    }),
    log: () => {},
    signal: new AbortController().signal,
    earlier: { status: () => undefined, observations: () => [] },
    ...overrides,
  };
  return ctx;
}

/** Runs the crawler and splits its result into pages (by URL) and the one site summary. */
export async function crawl(ctx: CollectContext) {
  const result = await crawler.collect(ctx);
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  const bySubject = (a: Observation, b: Observation) => a.subject.localeCompare(b.subject);
  const pages = result.observations.filter((o) => o.kind === "page").sort(bySubject);
  const sites = result.observations.filter((o) => o.kind === "site");
  if (sites.length !== 1 || !sites[0]) throw new Error("expected one site observation");
  return { pages, site: sites[0].value, subject: sites[0].subject };
}

/** What a page with no HTML to read (an error status or another content type) records. */
export const NO_HTML = {
  title: null,
  titleLength: null,
  metaDescription: null,
  descriptionLength: null,
  h1Count: null,
  canonical: null,
  robotsMeta: null,
  noindex: null,
  lang: null,
  jsonLdTypes: null,
  invalidJsonLd: null,
  wordCount: null,
  internalLinks: null,
  externalLinks: null,
  images: null,
  imagesMissingAlt: null,
  hasFaqMarkup: null,
  articleDatePublished: null,
  preferredSourcesLink: null,
  questionHeadings: null,
  conciseAnswers: null,
};
