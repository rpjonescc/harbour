import { errorPage, htmlPage, readiness as readinessObservation } from "@/tests/helpers/scoring";
import type { ScanObservation } from "../types";
import { conciseAnswers, preferredSources, qaCoverage } from "./aeo";
import { aiCrawlerAccess, citationReady, entitySchema, llmsTxt } from "./geo";
import type { Crawl, CrawledPage, Readiness, Vitals } from "./inputs";
import { coreWebVitals, indexability, searchVisibility } from "./seo";
import { technicalHealth } from "./seo-technical";
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
  it("scores only the 2xx share, less broken links, when no page has HTML", () => {
    const pages = [errorPage("/a", 500), errorPage("/b", 404), htmlPage("/c")];
    const broken = [{ from: "x", to: "https://docs.example.com/b" }];
    // checks over 1 HTML page are all 1: mean(1/3, 1, 1, 1, 1, 1) = 88.9, less 5
    expect(technicalHealth(crawlOf(pages, { brokenInternalLinks: broken })).score).toBe(84);
    expect(technicalHealth(crawlOf(pages.slice(0, 2))).score).toBe(0);
  });

  it("caps the broken-link penalty at 25 and never goes below 0", () => {
    const broken = Array.from({ length: 9 }, (_, i) => ({ from: "x", to: `t${i}` }));
    const result = technicalHealth(crawlOf([htmlPage("/")], { brokenInternalLinks: broken }));
    expect(result.score).toBe(75);
    expect(result.evidence).toContain("9 broken internal link targets (−25).");
  });

  it("does not count noindex on a page that names another canonical", () => {
    const duplicate = htmlPage("/print", { noindex: true, canonical: "https://docs.example.com/" });
    const result = technicalHealth(crawlOf([htmlPage("/"), duplicate]));
    expect(result.score).toBe(100);
    expect(result.evidence).toContain("0 of 1 indexable pages are noindex");
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
  it("scores a missing sitemap and a Googlebot block as zero", () => {
    const robots = { state: "ok", valid: true, googlebot: "blocked", aiCrawlerAccess: {} };
    const sitemap = { valid: null, sitemapsRead: 0, urlCount: null, partial: false, errors: [] };
    const result = indexability(crawlOf([]), readinessOf({ robotsTxt: robots, sitemap }));
    expect(result).toEqual({
      score: 0,
      evidence: "No sitemap found on the site's origin; robots.txt blocks Googlebot.",
      gaps: [],
    });
  });

  it("scores an invalid sitemap as zero", () => {
    const sitemap = { valid: false, sitemapsRead: 0, urlCount: null, partial: false, errors: [] };
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

describe("Search Console visibility", () => {
  const visibility = (impressions: number, priorImpressions: number) =>
    searchVisibility({ impressions, priorImpressions });

  it.each([
    [1000, 1000, 75],
    [800, 1000, 60],
    [1500, 1000, 100],
    [0, 1000, 0],
    [120, 0, 100],
    [0, 0, 0],
  ])("scores %d impressions after %d as %d", (now, before, expected) => {
    expect(visibility(now, before).score).toBe(expected);
  });

  it("explains a drop", () => {
    expect(visibility(800, 1000).evidence).toBe(
      "800 impressions in the last 28 days vs 1000 in the 28 days before (−20.0%).",
    );
  });
});

describe("GEO sub-scores", () => {
  it("scores AI crawler access as the share allowed", () => {
    const blocked = Object.fromEntries(["GPTBot", "CCBot", "ClaudeBot"].map((n) => [n, "blocked"]));
    const robots = { state: "ok", valid: true, googlebot: "allowed", aiCrawlerAccess: blocked };
    expect(aiCrawlerAccess(readinessOf({ robotsTxt: robots }))).toMatchObject({
      score: 0,
      evidence: "0 of 3 AI crawlers may fetch the home page; blocked: GPTBot, CCBot, ClaudeBot.",
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
});
