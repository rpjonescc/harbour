import {
  ACME_CRAWL,
  ACME_SCAN,
  ALL_OK,
  CONTEXT,
  cwv,
  daysOf,
  entryOf as entry,
  NOW,
  readiness,
  scoreOf as score,
  searchConsole,
} from "@/tests/helpers/scoring";
import { FORMULA_VERSION, SUB_SCORES } from "./score";

const DAY = 24 * 60 * 60_000;

describe("scoreScan on a full scan", () => {
  it("scores every sub-score and total exactly, with the evidence behind each", () => {
    expect(score(ACME_SCAN)).toEqual({
      formulaVersion: "v2",
      seo: 81,
      geo: 92,
      aeo: 88,
      complete: { seo: true, geo: true, aeo: true },
      breakdown: [
        {
          key: "seo.technical",
          label: "Technical health",
          score: 72,
          weight: 0.35,
          status: "ok",
          evidence:
            "6 pages crawled, 5 answered 2xx. Of 5 HTML pages: 4 have a 10–60 character title, " +
            "4 a 50–160 character description, 4 exactly one h1, 4 a canonical link; 1 of 5 " +
            "indexable pages is noindex. 2 of 6 pages link to a broken internal page (−8.3).",
        },
        {
          key: "seo.indexability",
          label: "Indexability",
          score: 92,
          weight: 0.25,
          status: "ok",
          evidence:
            "Sitemap valid (5 URLs); Googlebot allowed (some paths disallowed); 3 of 4 crawled " +
            "sitemap URLs answered 2xx.",
        },
        {
          key: "seo.cwv",
          label: "Core Web Vitals",
          score: 76,
          weight: 0.2,
          status: "ok",
          evidence: "PageSpeed this scan: mobile performance 72, field INP 260 ms (rated 80).",
        },
        {
          key: "seo.searchTrend",
          label: "Search impressions trend",
          score: 89,
          weight: 0.2,
          status: "ok",
          evidence:
            "59 impressions a day over 28 days in the last 28 days vs 50 a day over 28 days in " +
            "the 28 days before (+18.0%).",
        },
        {
          key: "geo.aiCrawlers",
          label: "AI crawler access",
          score: 94,
          weight: 0.3,
          status: "ok",
          evidence:
            "8 of 9 AI crawlers may fetch the home page: 4 of 4 search and retrieval agents, " +
            "4 of 5 training crawlers; blocked: GPTBot (training only); some paths disallowed " +
            "for: CCBot.",
        },
        {
          key: "geo.llmsTxt",
          label: "llms.txt",
          score: 100,
          weight: 0.15,
          status: "ok",
          evidence: "llms.txt present (81 bytes); llms-full.txt not present.",
        },
        {
          key: "geo.entities",
          label: "Entity structured data",
          score: 100,
          weight: 0.25,
          status: "ok",
          evidence: "Of 5 HTML pages: 1 declares an Organization or LocalBusiness, 1 the WebSite.",
        },
        {
          key: "geo.citations",
          label: "Citation-ready content",
          score: 80,
          weight: 0.3,
          status: "ok",
          evidence:
            "2 of 5 HTML pages have FAQ, HowTo or Article schema or question-style headings " +
            "(full marks at half the pages).",
        },
        {
          key: "geo.aiEngines",
          label: "AI engine mentions",
          score: null,
          weight: 0,
          status: "missing",
          evidence: "AI engine mention checks not connected (they need API keys).",
        },
        {
          key: "aeo.qaCoverage",
          label: "FAQ, HowTo and Q&A coverage",
          score: 100,
          weight: 0.4,
          status: "ok",
          evidence:
            "2 of 5 HTML pages have FAQPage, HowTo or QAPage markup (full marks at a quarter " +
            "of the pages).",
        },
        {
          key: "aeo.conciseAnswers",
          label: "Concise answer blocks",
          score: 67,
          weight: 0.35,
          status: "ok",
          evidence:
            "4 of 6 question-style headings are answered by a paragraph of at most 60 words " +
            "right below them.",
        },
        {
          key: "aeo.preferredSources",
          label: "Fresh content and Preferred Sources",
          score: 100,
          weight: 0.25,
          status: "ok",
          evidence: "4 URLs updated in the last 30 days (fresh content).",
        },
        {
          key: "aeo.snippets",
          label: "Featured snippets",
          score: null,
          weight: 0,
          status: "missing",
          evidence: "Featured-snippet data not connected (it needs a rankings API key).",
        },
      ],
    });
  });

  it("is pure: the same input scores the same and is left unchanged", () => {
    const input = structuredClone(ACME_SCAN);
    const first = score(input);
    expect(score(input)).toEqual(first);
    expect(input).toEqual(ACME_SCAN);
  });
});

describe("scoring v2 weights", () => {
  it.each(Object.entries(SUB_SCORES))("%s weights sum to 1", (_total, specs) => {
    const sum = specs.reduce((n, spec) => n + spec.weight, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("gives every sub-score a unique key under its total", () => {
    const keys = Object.entries(SUB_SCORES).flatMap(([total, specs]) =>
      specs.map((spec) => {
        expect(spec.key.startsWith(`${total}.`)).toBe(true);
        return spec.key;
      }),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("scoreScan with collectors that did not end ok", () => {
  it("leaves out sub-scores of unconnected Google sources: a gap, not a zero", () => {
    const statuses = {
      ...ALL_OK,
      pagespeed: "not_configured",
      "search-console": "not_configured",
    } as const;
    const result = score([...ACME_CRAWL, readiness()], statuses);
    // (0.35 × 72 + 0.25 × 92) / 0.6 = 80.33
    expect(result).toMatchObject({ seo: 80, geo: 92, aeo: 88 });
    expect(result?.complete).toEqual({ seo: false, geo: true, aeo: true });
    expect(entry(result, "seo.cwv")).toMatchObject({
      score: null,
      status: "missing",
      evidence: "PageSpeed is not connected",
    });
    expect(entry(result, "seo.searchTrend")?.evidence).toBe("Search Console is not connected");
  });

  it("scores what it can when the crawl failed and readiness had no crawl to read", () => {
    const blind = readiness({ sitemap: null, schema: null, preferredSources: null });
    const observations = [blind, cwv(), ...searchConsole(daysOf(28, 59), daysOf(28, 50))];
    const result = score(observations, { ...ALL_OK, crawler: "failed" });
    // SEO: (0.2 × 76 + 0.2 × 89) / 0.4 = 82.5; GEO: (0.3 × 94 + 0.15 × 100) / 0.45 = 96
    expect(result).toMatchObject({ seo: 83, geo: 96, aeo: null });
    expect(result?.complete).toEqual({ seo: false, geo: false, aeo: false });
    for (const key of ["seo.technical", "seo.indexability", "geo.entities", "aeo.qaCoverage"]) {
      expect(entry(result, key)).toMatchObject({
        score: null,
        status: "missing",
        evidence: "Crawler failed in this scan",
      });
    }
  });

  it("has no totals when every collector failed", () => {
    const failed = { crawler: "failed", readiness: "failed", pagespeed: "failed" } as const;
    const result = score([], { ...failed, "search-console": "failed" });
    expect(result).toMatchObject({ seo: null, geo: null, aeo: null });
    expect(result?.complete).toEqual({ seo: false, geo: false, aeo: false });
    const weighted = result?.breakdown.filter((e) => e.weight > 0) ?? [];
    expect(weighted.every((e) => e.status === "missing" && e.score === null)).toBe(true);
  });

  it("says a collector that never ran did not run", () => {
    const { pagespeed: _, ...rest } = ALL_OK;
    const result = score(ACME_SCAN, rest);
    expect(entry(result, "seo.cwv")?.evidence).toBe("PageSpeed did not run in this scan");
  });
});

describe("scoreScan with a weekly PageSpeed skipped this scan", () => {
  const skipped = { ...ALL_OK, pagespeed: "skipped" } as const;
  const withoutCwv = ACME_SCAN.filter((o) => o.collector !== "pagespeed");
  const previous = (daysAgo: number) => ({
    now: NOW,
    productKind: "product" as const,
    previousPagespeed: {
      observations: [cwv({ performanceScore: 90, fieldDataAvailable: false, inpMs: null })],
      finishedAt: new Date(NOW.getTime() - daysAgo * DAY),
    },
  });

  it("scores Core Web Vitals from the last run when it is under 14 days old", () => {
    const result = score(withoutCwv, skipped, previous(5));
    expect(entry(result, "seo.cwv")).toMatchObject({
      score: 90,
      status: "ok",
      evidence: "PageSpeed from 2026-09-26: mobile performance 90, no field data.",
    });
    expect(result?.complete.seo).toBe(true);
  });

  it("accepts a result exactly 14 days old", () => {
    expect(entry(score(withoutCwv, skipped, previous(14)), "seo.cwv")?.score).toBe(90);
  });

  it("leaves Core Web Vitals out when the last run is older than 14 days", () => {
    const result = score(withoutCwv, skipped, previous(15));
    expect(entry(result, "seo.cwv")).toMatchObject({
      score: null,
      evidence: "PageSpeed was skipped and its last result (2026-09-16) is more than 14 days old",
    });
    expect(result?.complete.seo).toBe(false);
  });

  it("leaves Core Web Vitals out when there is no earlier result", () => {
    const result = score(withoutCwv, skipped);
    expect(entry(result, "seo.cwv")?.evidence).toBe(
      "PageSpeed was skipped and has no earlier result",
    );
  });

  it("ignores an earlier result when PageSpeed failed this scan", () => {
    const result = score(withoutCwv, { ...ALL_OK, pagespeed: "failed" }, previous(1));
    expect(entry(result, "seo.cwv")?.evidence).toBe("PageSpeed failed in this scan");
  });
});

describe("scoring v2", () => {
  const stale = readiness({
    preferredSources: {
      button: true,
      buttonPages: ["https://docs.example.com/"],
      freshUrls: 1,
      freshContent: false,
    },
  });
  const observations = [
    ...ACME_CRAWL,
    stale,
    cwv(),
    ...searchConsole(daysOf(28, 59), daysOf(28, 50)),
  ];
  const scoreKind = (productKind: "news" | "product") =>
    score(observations, ALL_OK, { ...CONTEXT, productKind });

  it("is formula v2", () => {
    expect(FORMULA_VERSION).toBe("v2");
    expect(scoreKind("product")?.formulaVersion).toBe("v2");
  });

  it("changes only the Preferred Sources sub-score and the AEO total between kinds", () => {
    const news = scoreKind("news");
    const product = scoreKind("product");
    expect(entry(news, "aeo.preferredSources")?.score).toBe(50);
    expect(entry(product, "aeo.preferredSources")?.score).toBe(0);
    expect(entry(product, "aeo.preferredSources")?.weight).toBe(0.25);
    expect(news?.seo).toBe(product?.seo);
    expect(news?.geo).toBe(product?.geo);
    expect(news?.aeo).toBeGreaterThan(product?.aeo ?? 0);
  });
});
