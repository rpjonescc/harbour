import type { CollectContext, Collector, CollectorResult } from "../types";
import { type CrawlReadiness, readCrawl } from "./readiness-crawl";
import {
  checkRobots,
  checkTextFile,
  type RobotsReadiness,
  type TextFileReadiness,
} from "./readiness-files";
import { checkHttps, type HttpsReadiness } from "./readiness-https";

/**
 * The `readiness` observation (subject: the normalised product URL). Parts drawn from this
 * scan's crawl (`sitemap`, `schema`, `preferredSources`) are null when the crawl did not end ok.
 */
export type Readiness = CrawlReadiness & {
  robotsTxt: RobotsReadiness;
  llmsTxt: TextFileReadiness;
  llmsFullTxt: TextFileReadiness;
  https: HttpsReadiness;
};

async function collect(ctx: CollectContext): Promise<CollectorResult> {
  const { fetch, signal } = ctx;
  const subject = new URL(ctx.product.url).href;
  const https = await checkHttps(fetch, subject, signal);
  const origin = https.siteOrigin;
  const [robotsTxt, llmsTxt, llmsFullTxt] = await Promise.all([
    checkRobots(fetch, origin, signal),
    checkTextFile(fetch, origin, "/llms.txt", signal),
    checkTextFile(fetch, origin, "/llms-full.txt", signal),
  ]);
  // A failed crawl stored nothing, so its parts read as unknown rather than absent.
  const crawled = ctx.earlier.status("crawler") === "ok";
  if (!crawled) ctx.log("no crawl this scan: sitemap, schema and Preferred Sources are unknown");
  const crawl = readCrawl(crawled ? ctx.earlier.observations("crawler") : [], ctx.now, ctx.log);
  const value: Readiness = { ...crawl, robotsTxt, llmsTxt, llmsFullTxt, https };
  return { status: "ok", observations: [{ kind: "readiness", subject, value }] };
}

/** AI and search readiness: robots.txt, llms.txt, sitemaps, schema, HTTPS, Preferred Sources. */
export const readiness: Collector = {
  id: "readiness",
  cadence: "daily",
  dependsOn: ["crawler"],
  collect,
};
