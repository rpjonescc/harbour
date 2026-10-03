import {
  ACME_CRAWL,
  daysOf,
  entryOf,
  errorPage,
  htmlPage,
  readiness as readinessObservation,
  scoreOf,
  searchConsole,
} from "@/tests/helpers/scoring";
import type { ScanObservation } from "../types";
import type { Crawl, CrawledPage, Readiness, Vitals } from "./inputs";
import { coreWebVitals } from "./seo";
import { indexability } from "./seo-indexability";
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
  const trend = (current: (number | null)[], prior: (number | null)[]) =>
    entryOf(scoreOf([...ACME_CRAWL, ...searchConsole(current, prior)]), "seo.searchTrend");

  it("treats days without a row inside a finished window as zero impressions", () => {
    const patchy = [...daysOf(20, 10), ...daysOf(7, null), 10];
    // 210 over 28 days now, 200 over 28 before: +5%
    expect(trend(patchy, [...daysOf(20, 10), ...daysOf(8, null)])).toMatchObject({
      score: 79,
      evidence:
        "7.5 impressions a day over 28 days in the last 28 days vs 7.1 a day over 28 days in " +
        "the 28 days before (+5.0%).",
    });
  });

  it("does not count missing days at the end of the window, which may still be in lag", () => {
    expect(trend([...daysOf(27, 50), null], daysOf(28, 50))?.score).toBe(75);
  });

  it("trims at most 3 missing days at the end", () => {
    // 23 × 50 over 25 days = 46 a day vs 50: −8% → 69
    expect(trend([...daysOf(23, 50), ...daysOf(5, null)], daysOf(28, 50))?.score).toBe(69);
  });

  it("counts a day without a row mid-window as a zero that lowers the mean", () => {
    const gap = [...daysOf(13, 50), null, ...daysOf(14, 50)];
    // 27 × 50 over 28 days: −3.6% → 72.3
    expect(trend(gap, daysOf(28, 50))?.score).toBe(72);
  });

  it.each([
    [daysOf(28, 80), daysOf(28, 100), 60],
    [daysOf(28, 150), daysOf(28, 100), 100],
  ])("scores a change in daily impressions", (current, prior, expected) => {
    expect(trend(current, prior)?.score).toBe(expected);
  });

  it("scores impressions that stopped as zero", () => {
    expect(trend([], daysOf(28, 50))).toMatchObject({
      score: 0,
      evidence: "No impressions in the last 28 days vs 1400 in the 28 days before.",
    });
  });

  it("has no baseline when earlier data starts late but this window's starts on time", () => {
    const late = [...daysOf(10, null), ...daysOf(18, 50)];
    expect(trend(daysOf(28, 50), late)).toMatchObject({
      score: null,
      status: "missing",
      evidence:
        "No full baseline: earlier data starts on 2026-08-14, 10 days into the 28 days before " +
        "(the property may be newer)",
    });
  });

  it("compares windows that both start late, as for a seasonal site", () => {
    const late = [...daysOf(10, null), ...daysOf(18, 50)];
    // 900 over 28 days both times: flat
    expect(trend(late, late)?.score).toBe(75);
  });

  it("is missing without the Search Console summary that dates the windows", () => {
    const observations = searchConsole(daysOf(28, 50), daysOf(28, 50)).filter(
      (o) => o.kind !== "gsc_summary",
    );
    expect(entryOf(scoreOf([...ACME_CRAWL, ...observations]), "seo.searchTrend")?.evidence).toBe(
      "Search Console stored no single gsc_summary result",
    );
  });

  it.each([
    ["a window shorter than 28 days", { endDate: "2026-09-27" }],
    ["an earlier window that ends before it starts", { priorEndDate: "2026-08-03" }],
    [
      "an earlier window of zero days",
      { priorEndDate: "2026-08-03", priorStartDate: "2026-08-04" },
    ],
    ["windows longer than 28 days", { startDate: "2026-08-31", priorEndDate: "2026-09-01" }],
  ])("is missing for %s, never dividing by a bad length", (_, dates) => {
    const observations = searchConsole(daysOf(28, 50), daysOf(28, 50)).map((o) =>
      o.kind === "gsc_summary" ? { ...o, value: { ...o.value, ...dates } } : o,
    );
    expect(entryOf(scoreOf([...ACME_CRAWL, ...observations]), "seo.searchTrend")).toMatchObject({
      score: null,
      status: "missing",
      evidence: "Search Console windows have an unexpected length",
    });
  });

  it("has no trend for a new property without earlier impressions", () => {
    expect(trend(daysOf(10, 12), [])).toMatchObject({
      score: null,
      evidence: "No earlier data to compare: no impressions in the 28 days before",
    });
  });

  it("has no trend on too little earlier volume", () => {
    expect(trend(daysOf(28, 20), [...daysOf(8, 10), ...daysOf(20, null)])).toMatchObject({
      score: null,
      evidence:
        "Too little volume to judge a trend: 80 impressions in the 28 days before (needs 100)",
    });
  });
});
