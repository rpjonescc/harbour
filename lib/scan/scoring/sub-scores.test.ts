import { errorPage, htmlPage, readiness as readinessObservation } from "@/tests/helpers/scoring";
import type { ScanObservation } from "../types";
import { conciseAnswers, preferredSources, qaCoverage } from "./aeo";
import { aiCrawlerAccess, citationReady, entitySchema, llmsTxt } from "./geo";
import type { Crawl, CrawledPage, Readiness, Vitals } from "./inputs";
import { coreWebVitals } from "./seo";
import { indexability } from "./seo-indexability";
import { technicalHealth } from "./seo-technical";
import { searchTrend } from "./seo-trend";
import { toScore } from "./sub-score";

const crawlOf = (pages: ScanObservation[], site: Record<string, unknown> = {}): Crawl => ({
  pages: pages.map((p) => p.value as CrawledPage),
  site: { brokenInternalLinks: [], sitemapPages: null, ...site },
});
const readinessOf = (parts: Record<string, Record<string, unknown> | null> = {}) =>
  readinessObservation(parts).value as Readiness;
const vitals = (value: Partial<Vitals>): Vitals => ({
  performanceScore: 80,
  inpMs: null,
  fieldDataAvailable: false,
  measuredOn: null,
  ...value,
});

describe("toScore (rounding)", () => {
  it.each([
    [0.5, 1],
    [72.5, 73],
    [72.49, 72],
    [72.4999999999, 73], // floating-point noise for 72.5
    [-3, 0],
    [104, 100],
    [Number.MIN_VALUE, 0],
  ])("rounds %d to %d", (value, expected) => {
    expect(toScore(value)).toBe(expected);
  });
});

describe("technical health", () => {
  it("scores error pages by the 2xx share and HTML checks over the pages that have HTML", () => {
    const pages = [errorPage("/a", 500), errorPage("/b", 404), htmlPage("/c")];
    const broken = [{ from: "https://docs.example.com/c", to: "https://docs.example.com/b" }];
    // mean(1/3, then 1 for each HTML check) = 88.9, less 25 × 1/3 pages carrying a broken link
    const result = technicalHealth(crawlOf(pages, { brokenInternalLinks: broken }));
    expect(result.score).toBe(81);
    expect(result.evidence).toContain("1 of 3 pages links to a broken internal page (−8.3).");
    expect(technicalHealth(crawlOf(pages.slice(0, 2))).score).toBe(0);
  });

  it("scales the broken-link penalty to the share of pages carrying a broken link", () => {
    const pages = ["/", "/a", "/b", "/c"].map((path) => htmlPage(path));
    const from = (paths: string[]) =>
      paths.map((path) => ({ from: `https://docs.example.com${path}`, to: "https://x/gone" }));
    // one page of four: 25 × 1/4 = 6.25 off
    const one = technicalHealth(crawlOf(pages, { brokenInternalLinks: from(["/", "/"]) }));
    expect(one.score).toBe(94);
    const all = technicalHealth(
      crawlOf(pages, { brokenInternalLinks: from(["/", "/a", "/b", "/c"]) }),
    );
    expect(all).toMatchObject({ score: 75 });
    expect(all.evidence).toContain("4 of 4 pages link to a broken internal page (−25).");
  });

  it("does not count noindex on a page that names another canonical", () => {
    const duplicate = htmlPage("/print", { noindex: true, canonical: "https://docs.example.com/" });
    const result = technicalHealth(crawlOf([htmlPage("/"), duplicate]));
    expect(result.score).toBe(100);
    expect(result.evidence).toContain("0 of 1 indexable pages are noindex");
  });

  it("matches a canonical to its page despite a trailing slash, default port or fragment", () => {
    const canonical = "https://docs.example.com:443/print/#top";
    const self = htmlPage("/print", { noindex: true, canonical });
    const result = technicalHealth(crawlOf([htmlPage("/"), self]));
    // the noindex page is indexable: mean(1, 1, 1, 1, 1, 1/2) = 91.7
    expect(result.score).toBe(92);
    expect(result.evidence).toContain("1 of 2 indexable pages is noindex");
  });

  it("keeps the query when comparing a canonical", () => {
    const canonical = "https://docs.example.com/print?view=1";
    const other = htmlPage("/print", { noindex: true, canonical });
    expect(technicalHealth(crawlOf([htmlPage("/"), other])).score).toBe(100);
  });

  it("is missing when the crawl recorded no pages", () => {
    expect(technicalHealth(crawlOf([]))).toEqual({
      score: null,
      evidence: "The crawl recorded no pages",
      gaps: [],
    });
  });
});

describe("indexability", () => {
  const noSitemap = {
    ...{ valid: null, sitemapsRead: 0, urlCount: null, partial: false },
    ...{ errors: [], offOrigin: [] },
  };

  it("scores no sitemap and a Googlebot block as zero", () => {
    const robots = { state: "ok", valid: true, googlebot: "blocked", aiCrawlerAccess: {} };
    const result = indexability(
      crawlOf([]),
      readinessOf({ robotsTxt: robots, sitemap: noSitemap }),
    );
    expect(result).toEqual({
      score: 0,
      evidence: "No sitemap found on the site's origin; robots.txt blocks Googlebot.",
      gaps: [],
    });
  });

  it("gives an invalid sitemap no credit while Googlebot's access still counts", () => {
    const errors = [{ url: "https://docs.example.com/sitemap.xml", kind: "invalid" }];
    const sitemap = { ...noSitemap, valid: false, errors };
    expect(indexability(crawlOf([]), readinessOf({ sitemap }))).toMatchObject({ score: 50 });
  });
});

describe("Core Web Vitals", () => {
  it.each([
    [200, 100],
    [350, 50],
    [500, 0],
    [900, 0],
  ])("rates field INP %d ms as %d", (inpMs, rated) => {
    const result = coreWebVitals(
      vitals({ performanceScore: null, inpMs, fieldDataAvailable: true }),
    );
    expect(result.score).toBe(rated);
  });

  it("uses the lab score alone without field data", () => {
    expect(coreWebVitals(vitals({ performanceScore: 41 })).score).toBe(41);
  });

  it("is missing without a lab score or field INP", () => {
    expect(coreWebVitals(vitals({ performanceScore: null }))).toMatchObject({
      score: null,
      evidence: "PageSpeed this scan: no performance score or field INP",
    });
  });
});

describe("search impressions trend", () => {
  const trend = (impressions: number, days: number, priorImpressions: number, priorDays: number) =>
    searchTrend({ impressions, days, priorImpressions, priorDays });

  it.each([
    [2800, 28, 2600, 26, 75], // same daily mean over day counts within 3: flat
    [800, 28, 1000, 28, 60],
    [1500, 28, 1000, 28, 100],
    [0, 0, 1000, 28, 0],
  ])("scores %d impressions over %d days after %d over %d as %d", (...args) => {
    const [now, days, before, priorDays, expected] = args;
    expect(trend(now, days, before, priorDays).score).toBe(expected);
  });

  it("explains a drop by daily means", () => {
    expect(trend(800, 28, 1000, 25).evidence).toBe(
      "28.6 impressions a day over 28 days in the last 28 days vs 40 a day over 25 days in the " +
        "28 days before (−28.6%).",
    );
  });

  it("explains impressions that stopped", () => {
    expect(trend(0, 0, 1000, 28).evidence).toBe(
      "No impressions in the last 28 days vs 1000 in the 28 days before.",
    );
  });

  it("does not compare windows whose day counts differ by more than 3", () => {
    expect(trend(1000, 28, 1000, 20)).toMatchObject({
      score: null,
      evidence:
        "Not comparable: impressions on 28 days in the last 28 days but 20 in the 28 days before",
    });
  });

  it("has no trend for a new property without earlier impressions", () => {
    expect(trend(120, 10, 0, 0)).toMatchObject({
      score: null,
      evidence: "No earlier data to compare: no impressions in the 28 days before",
    });
  });

  it("has no trend on too little earlier volume", () => {
    expect(trend(500, 28, 80, 27)).toMatchObject({
      score: null,
      evidence:
        "Too little volume to judge a trend: 80 impressions in the 28 days before (needs 100)",
    });
  });
});

describe("GEO sub-scores", () => {
  it("scores AI crawler access as the share allowed", () => {
    const blocked = Object.fromEntries(["GPTBot", "CCBot", "ClaudeBot"].map((n) => [n, "blocked"]));
    const robots = { state: "ok", valid: true, googlebot: "allowed", aiCrawlerAccess: blocked };
    expect(aiCrawlerAccess(readinessOf({ robotsTxt: robots }))).toMatchObject({
      score: 0,
      evidence:
        "0 of 3 AI crawlers may fetch the home page: 0 of 3 training crawlers; blocked: " +
        "GPTBot (training only), CCBot (training only), ClaudeBot (training only).",
    });
  });

  it("weighs search and retrieval agents three times as much as training crawlers", () => {
    const access = { "OAI-SearchBot": "blocked", GPTBot: "allowed" };
    const robots = { state: "ok", valid: true, googlebot: "allowed", aiCrawlerAccess: access };
    expect(aiCrawlerAccess(readinessOf({ robotsTxt: robots }))).toMatchObject({
      // allowed weight 1 of 3 + 1
      score: 25,
      evidence:
        "1 of 2 AI crawlers may fetch the home page: 0 of 1 search and retrieval agent, " +
        "1 of 1 training crawler; blocked: OAI-SearchBot.",
    });
  });

  it("scores a missing llms.txt as zero and an unknown one as missing", () => {
    const absent = { present: false, bytes: null };
    expect(llmsTxt(readinessOf({ llmsTxt: absent }))).toMatchObject({
      score: 0,
      evidence: "No llms.txt; llms-full.txt not present.",
    });
    expect(llmsTxt(readinessOf({ llmsTxt: { present: null, bytes: null } })).score).toBeNull();
  });

  it("gives 60 for an Organization alone and 0 without entity schema", () => {
    const schema = (organization: number, website: number) => ({
      pagesChecked: 4,
      pagesWith: { Organization: organization, WebSite: website },
    });
    expect(entitySchema(readinessOf({ schema: schema(2, 0) })).score).toBe(60);
    expect(entitySchema(readinessOf({ schema: schema(0, 1) })).score).toBe(40);
    expect(entitySchema(readinessOf({ schema: schema(0, 0) })).score).toBe(0);
    const none = { pagesChecked: 0, pagesWith: { Organization: 0, WebSite: 0 } };
    expect(entitySchema(readinessOf({ schema: none })).score).toBeNull();
  });

  it("scores citation-ready content against half the pages", () => {
    const pages = [
      htmlPage("/a", { jsonLdTypes: ["TechArticle"] }),
      htmlPage("/b"),
      htmlPage("/c"),
      htmlPage("/d"),
      htmlPage("/e"),
    ];
    // 1 of 5 = 20% of pages, 40% of the target
    expect(citationReady(crawlOf(pages)).score).toBe(40);
    expect(citationReady(crawlOf([errorPage("/x", 500)])).score).toBeNull();
  });
});

describe("AEO sub-scores", () => {
  it("scores Q&A coverage against a quarter of the pages", () => {
    const pages = [
      htmlPage("/q", { jsonLdTypes: ["QAPage"] }),
      ...["/a", "/b", "/c", "/d", "/e"].map((p) => htmlPage(p)),
    ];
    // 1 of 6 = 16.7% of pages, 66.7% of the target
    expect(qaCoverage(crawlOf(pages)).score).toBe(67);
  });

  it("scores no question headings as zero", () => {
    expect(conciseAnswers(crawlOf([htmlPage("/"), htmlPage("/b")]))).toEqual({
      score: 0,
      evidence: "No question-style headings on 2 HTML pages.",
      gaps: [],
    });
  });

  it("gives 50 each for the button and fresh content", () => {
    const ready = (button: boolean, freshContent: boolean) =>
      readinessOf({
        preferredSources: {
          button,
          buttonPages: button ? ["https://docs.example.com/"] : [],
          freshUrls: freshContent ? 3 : 2,
          freshContent,
        },
      });
    expect(preferredSources(ready(false, true)).score).toBe(50);
    expect(preferredSources(ready(true, false)).score).toBe(50);
    expect(preferredSources(ready(false, false))).toMatchObject({
      score: 0,
      evidence:
        "No Preferred Sources button; 2 URLs updated in the last 30 days (not enough for fresh content).",
    });
  });

  it("counts one fresh URL in the singular", () => {
    const one = { button: false, buttonPages: [], freshUrls: 1, freshContent: false };
    expect(preferredSources(readinessOf({ preferredSources: one })).evidence).toContain(
      "1 URL updated in the last 30 days",
    );
  });
});
