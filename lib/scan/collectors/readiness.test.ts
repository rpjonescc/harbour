import { crawlContext as context } from "@/tests/helpers/crawl";
import { fixtureSite } from "@/tests/helpers/fixture-site";
import { closeSites, text } from "@/tests/helpers/http-site";
import { crawler } from "./crawler";
import { type Readiness, readiness } from "./readiness";

afterEach(closeSites);

/** Runs readiness after a crawl of the same site that ended with `crawlStatus`. */
async function readinessAfterCrawl(url: string, crawlStatus: "ok" | "failed" = "ok") {
  const crawled = crawlStatus === "ok" ? await crawler.collect(context(url)) : null;
  const observations = crawled?.status === "ok" ? crawled.observations : [];
  const ctx = context(url, {
    earlier: {
      status: (id) => (id === "crawler" ? crawlStatus : undefined),
      observations: (id) => (id === "crawler" ? observations : []),
    },
  });
  const result = await readiness.collect(ctx);
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result.observations;
}

describe("readiness on a recorded site", () => {
  it("records one exact readiness observation", async () => {
    const { origin } = await fixtureSite("acme-news");
    const observations = await readinessAfterCrawl(`${origin}/`);
    const partial = "partial";
    expect(observations).toEqual([
      {
        kind: "readiness",
        subject: `${origin}/`,
        value: {
          robotsTxt: {
            state: "ok",
            valid: true,
            googlebot: partial,
            aiCrawlerAccess: {
              GPTBot: "blocked",
              "OAI-SearchBot": partial,
              "ChatGPT-User": partial,
              PerplexityBot: partial,
              ClaudeBot: partial,
              "Claude-SearchBot": partial,
              "Google-Extended": partial,
              CCBot: partial,
              Bytespider: partial,
            },
          },
          llmsTxt: { present: true, status: 200, bytes: 81, truncated: false, error: null },
          llmsFullTxt: { present: false, status: 404, bytes: null, truncated: false, error: null },
          sitemap: {
            reachable: true,
            valid: true,
            sitemapsRead: 1,
            urlCount: 5,
            partial: false,
            errors: [{ url: "https://example.com/sitemap.xml", kind: "off_origin" }],
            offOrigin: ["https://example.com/sitemap.xml"],
            datedUrls: 4,
            newestLastmod: "2026-09-25T00:00:00.000Z",
            modifiedLast30Days: 2,
          },
          schema: {
            pagesChecked: 6,
            pagesWith: {
              Organization: 2,
              WebSite: 1,
              LocalBusiness: 1,
              FAQPage: 1,
              HowTo: 1,
              Article: 4,
            },
          },
          preferredSources: {
            button: true,
            buttonPages: [`${origin}/`],
            freshUrls: 3,
            freshContent: true,
          },
          https: {
            productUrlHttps: false,
            httpUpgradesToHttps: false,
            downgrades: [],
            hosts: [{ url: `${origin}/`, finalUrl: `${origin}/`, error: null }],
            hostsConsistent: null,
            siteOrigin: origin,
          },
        },
      },
    ]);
  });

  it("reports crawl-based parts as unknown when the crawl failed, and still checks files", async () => {
    const { origin } = await fixtureSite("acme-news");
    const [observation] = await readinessAfterCrawl(`${origin}/`, "failed");
    expect(observation?.value).toMatchObject({
      sitemap: null,
      schema: null,
      preferredSources: null,
      robotsTxt: { state: "ok" },
      llmsTxt: { present: true },
    });
  });

  it("still checks files and HTTPS when the crawl's observations have an unexpected shape", async () => {
    const { origin } = await fixtureSite("acme-news");
    const logs: string[] = [];
    const ctx = context(`${origin}/`, {
      log: (line) => logs.push(line),
      earlier: {
        status: () => "ok",
        observations: () => [{ kind: "site", subject: `${origin}/`, value: { pagesCrawled: 1 } }],
      },
    });
    const result = await readiness.collect(ctx);
    const value = result.status === "ok" ? result.observations[0]?.value : null;
    expect(value).toMatchObject({
      sitemap: null,
      schema: null,
      preferredSources: null,
      robotsTxt: { state: "ok" },
      llmsTxt: { present: true },
      https: { siteOrigin: origin },
    });
    expect(logs.some((line) => line.includes("unexpected shape"))).toBe(true);
  });

  it("does not take an HTML page served at /llms.txt for the file", async () => {
    const { origin } = await fixtureSite("acme-news", {
      "/llms.txt": text("<!doctype html><html><body>App shell</body></html>"),
    });
    const [observation] = await readinessAfterCrawl(`${origin}/`);
    expect(observation?.value).toMatchObject({
      llmsTxt: { present: false, status: 200, bytes: null },
    });
  });

  it("reads a missing robots.txt as no rules: every AI crawler allowed", async () => {
    const { origin } = await fixtureSite("acme-news", {
      "/robots.txt": (_req, res) => res.writeHead(404).end(),
    });
    const [observation] = await readinessAfterCrawl(`${origin}/`);
    const robots = (observation?.value as Readiness | undefined)?.robotsTxt;
    expect(robots).toMatchObject({ state: "missing", valid: null, googlebot: "allowed" });
    expect(new Set(Object.values(robots?.aiCrawlerAccess ?? {}))).toEqual(new Set(["allowed"]));
  });

  it("reports robots.txt it cannot read as unknown", async () => {
    const { origin } = await fixtureSite("acme-news", {
      "/robots.txt": (_req, res) => res.writeHead(503).end(),
    });
    const [observation] = await readinessAfterCrawl(`${origin}/`, "failed");
    expect(observation?.value).toMatchObject({
      robotsTxt: { state: "unavailable", valid: null, googlebot: null, aiCrawlerAccess: null },
    });
  });
});
