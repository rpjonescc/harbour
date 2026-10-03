import { errorPage, htmlPage, readiness as readinessObservation } from "@/tests/helpers/scoring";
import type { ScanObservation } from "../types";
import { conciseAnswers, preferredSources, qaCoverage } from "./aeo";
import { aiCrawlerAccess, citationReady, entitySchema, llmsTxt } from "./geo";
import type { Crawl, CrawledPage, Readiness } from "./inputs";

// The GEO and AEO sub-scores of the current formula; SEO's are in sub-scores.test.ts.

const crawlOf = (pages: ScanObservation[], site: Record<string, unknown> = {}): Crawl => ({
  pages: pages.map((p) => p.value as CrawledPage),
  site: { brokenInternalLinks: [], sitemapPages: null, ...site },
});
const readinessOf = (parts: Record<string, Record<string, unknown> | null> = {}) =>
  readinessObservation(parts).value as Readiness;

describe("GEO sub-scores", () => {
  it("is missing when only training crawlers were reported: nothing to count", () => {
    const blocked = Object.fromEntries(["GPTBot", "CCBot", "ClaudeBot"].map((n) => [n, "blocked"]));
    const robots = { state: "ok", valid: true, googlebot: "allowed", aiCrawlerAccess: blocked };
    expect(aiCrawlerAccess(readinessOf({ robotsTxt: robots }))).toMatchObject({
      score: null,
      evidence: "Readiness reported no AI search agents",
    });
  });

  it("counts only search and retrieval agents, listing training crawlers as not counted", () => {
    const access = { "OAI-SearchBot": "blocked", PerplexityBot: "partial", GPTBot: "allowed" };
    const robots = { state: "ok", valid: true, googlebot: "allowed", aiCrawlerAccess: access };
    expect(aiCrawlerAccess(readinessOf({ robotsTxt: robots }))).toMatchObject({
      // 1 of 2 search agents may read the site (partial counts as allowed)
      score: 50,
      evidence:
        "2 of 3 AI crawlers may fetch the home page: 1 of 2 search and retrieval agents, " +
        "1 of 1 training crawler (not counted); blocked: OAI-SearchBot; some paths disallowed " +
        "for: PerplexityBot.",
    });
  });

  it.each(["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Bytespider"])(
    "does not lower the score when the training crawler %s is blocked",
    (crawler) => {
      const access = { "OAI-SearchBot": "allowed", [crawler]: "blocked" };
      const robots = { state: "ok", valid: true, googlebot: "allowed", aiCrawlerAccess: access };
      const result = aiCrawlerAccess(readinessOf({ robotsTxt: robots }));
      expect(result.score).toBe(100);
      expect(result.evidence).toContain(`blocked: ${crawler} (training only)`);
    },
  );

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

  it("no longer counts FAQ or HowTo markup alone as citation-ready (formula v3)", () => {
    const pages = [
      htmlPage("/a", { jsonLdTypes: ["FAQPage"], hasFaqMarkup: true }),
      htmlPage("/b", { jsonLdTypes: ["HowTo"] }),
    ];
    expect(citationReady(crawlOf(pages))).toMatchObject({
      score: 0,
      evidence:
        "0 of 2 HTML pages have Article schema or question-style headings (full marks at half " +
        "the pages).",
    });
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
    expect(preferredSources(ready(false, true), "news").score).toBe(50);
    expect(preferredSources(ready(true, false), "news").score).toBe(50);
    expect(preferredSources(ready(false, false), "news")).toMatchObject({
      score: 0,
      evidence:
        "No Preferred Sources button; 2 URLs updated in the last 30 days (not enough for fresh content).",
    });
  });

  it("counts one fresh URL in the singular", () => {
    const one = { button: false, buttonPages: [], freshUrls: 1, freshContent: false };
    expect(preferredSources(readinessOf({ preferredSources: one }), "news").evidence).toContain(
      "1 URL updated in the last 30 days",
    );
  });
});

describe("preferredSources by kind (formula v2)", () => {
  const ready = (button: boolean, freshContent: boolean) =>
    readinessOf({
      preferredSources: {
        button,
        buttonPages: button ? ["https://docs.example.com/"] : [],
        freshUrls: freshContent ? 3 : 2,
        freshContent,
      },
    });

  it("scores a product site on freshness alone: the button adds nothing", () => {
    expect(preferredSources(ready(true, false), "product")).toMatchObject({
      score: 0,
      evidence: "2 URLs updated in the last 30 days (not enough for fresh content).",
    });
    expect(preferredSources(ready(false, true), "product")).toMatchObject({
      score: 100,
      evidence: "3 URLs updated in the last 30 days (fresh content).",
    });
    expect(preferredSources(ready(true, true), "product").score).toBe(100);
  });

  it("keeps the v1 split for a news site", () => {
    expect(preferredSources(ready(true, false), "news").score).toBe(50);
    expect(preferredSources(ready(false, true), "news").score).toBe(50);
    expect(preferredSources(ready(true, true), "news").score).toBe(100);
  });

  it.each(["news", "product"] as const)(
    "is missing, not zero, when readiness can't read the crawl (%s)",
    (kind) => {
      const blind = readinessOf({ preferredSources: null });
      expect(preferredSources(blind, kind).score).toBeNull();
    },
  );
});
