import {
  ACME_CRAWL,
  ACME_SCAN,
  ALL_OK,
  CONTEXT,
  crawlSite,
  cwv,
  NOW,
  readiness,
  searchConsole,
} from "@/tests/helpers/scoring";
import { FORMULA_VERSION, SUB_SCORES, scoreScan } from "./score";
import type { ScanObservation } from "./types";

const DAY = 24 * 60 * 60_000;
const score = (
  observations: ScanObservation[],
  statuses: Record<string, "ok" | "failed" | "not_configured" | "skipped"> = ALL_OK,
  context = CONTEXT,
) => scoreScan(observations, statuses, context);
const entry = (result: ReturnType<typeof score>, key: string) =>
  result?.breakdown.find((e) => e.key === key);

describe("scoreScan on a full scan", () => {
  it("scores every sub-score and total exactly, with the evidence behind each", () => {
    expect(score(ACME_SCAN)).toEqual({
      formulaVersion: "v1",
      seo: 83,
      geo: 91,
      aeo: 88,
      complete: { seo: true, geo: true, aeo: true },
      breakdown: [
        {
          key: "seo.technical",
          label: "Technical health",
          score: 76,
          weight: 0.35,
          status: "ok",
          evidence:
            "6 pages crawled, 5 answered 2xx. Of 5 HTML pages: 4 have a 10–60 character title, " +
            "4 a 50–160 character description, 4 exactly one h1, 4 a canonical link; 1 of 5 " +
            "indexable pages are noindex. 1 broken internal link target (−5).",
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
          key: "seo.visibility",
          label: "Search Console visibility",
          score: 89,
          weight: 0.2,
          status: "ok",
          evidence: "1770 impressions in the last 28 days vs 1500 in the 28 days before (+18.0%).",
        },
        {
          key: "geo.aiCrawlers",
          label: "AI crawler access",
          score: 89,
          weight: 0.3,
          status: "ok",
          evidence:
            "8 of 9 AI crawlers may fetch the home page; blocked: GPTBot; some paths disallowed " +
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
          evidence: "Of 5 HTML pages: 1 declare an Organization or LocalBusiness, 1 the WebSite.",
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
          label: "Preferred Sources readiness",
          score: 100,
          weight: 0.25,
          status: "ok",
          evidence:
            "Preferred Sources button on 1 page; 4 URLs updated in the last 30 days (fresh content).",
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

  it("is formula v1", () => {
    expect(FORMULA_VERSION).toBe("v1");
    expect(score(ACME_SCAN)?.formulaVersion).toBe("v1");
  });
});

describe("scoring v1 weights", () => {
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
    // (0.35 × 76 + 0.25 × 92) / 0.6 = 82.67
    expect(result).toMatchObject({ seo: 83, geo: 91, aeo: 88 });
    expect(result?.complete).toEqual({ seo: false, geo: true, aeo: true });
    expect(entry(result, "seo.cwv")).toMatchObject({
      score: null,
      status: "missing",
      evidence: "PageSpeed is not connected",
    });
    expect(entry(result, "seo.visibility")?.evidence).toBe("Search Console is not connected");
  });

  it("scores what it can when the crawl failed and readiness had no crawl to read", () => {
    const blind = readiness({ sitemap: null, schema: null, preferredSources: null });
    const observations = [blind, cwv(), ...searchConsole([412, 388, 503, 467], [700, 800])];
    const result = score(observations, { ...ALL_OK, crawler: "failed" });
    // SEO: (0.2 × 76 + 0.2 × 89) / 0.4 = 82.5; GEO: (0.3 × 89 + 0.15 × 100) / 0.45 = 92.67
    expect(result).toMatchObject({ seo: 83, geo: 93, aeo: null });
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

describe("scoreScan with partly unknown inputs", () => {
  it("marks SEO incomplete for a partial sitemap and unreadable robots.txt", () => {
    const unread = { state: "unavailable", valid: null, googlebot: null, aiCrawlerAccess: null };
    const partial = {
      ...{ reachable: true, valid: true, sitemapsRead: 1, urlCount: 5, partial: true },
      errors: [{ url: "https://docs.example.com/sitemap-blog.xml", status: 500 }],
    };
    const observations = ACME_SCAN.filter((o) => o.collector !== "readiness");
    const result = score([...observations, readiness({ robotsTxt: unread, sitemap: partial })]);
    expect(entry(result, "seo.indexability")).toEqual({
      key: "seo.indexability",
      label: "Indexability",
      // mean(sitemap valid 1, 3 of 4 sitemap URLs ok) = 87.5, half up
      score: 88,
      weight: 0.25,
      status: "ok",
      evidence:
        "Sitemap valid (at least 5 URLs); 3 of 4 crawled sitemap URLs answered 2xx. " +
        "Incomplete: sitemap partial: 1 sitemap could not be read, so the URL count covers " +
        "only the 1 read; robots.txt could not be read, so Googlebot's access is unknown.",
    });
    expect(entry(result, "geo.aiCrawlers")?.evidence).toBe(
      "robots.txt could not be read (unavailable): AI crawler access unknown",
    );
    expect(result?.complete).toEqual({ seo: false, geo: false, aeo: true });
    // SEO still scores: 0.35 × 76 + 0.25 × 88 + 0.2 × 76 + 0.2 × 89 = 81.6
    expect(result?.seo).toBe(82);
  });
});

describe("scoreScan with malformed observations", () => {
  it("treats a readiness value of the wrong shape as missing, not zero", () => {
    const broken = { ...readiness(), value: { robotsTxt: "ok" } };
    const observations = [...ACME_SCAN.filter((o) => o.collector !== "readiness"), broken];
    const result = score(observations);
    const evidence = entry(result, "geo.llmsTxt")?.evidence ?? "";
    expect(evidence).toMatch(/^Readiness data has an unexpected shape \(robotsTxt: /);
    expect(entry(result, "geo.llmsTxt")?.score).toBeNull();
    expect(result?.complete.geo).toBe(false);
  });

  it("treats a crawled page of the wrong shape as missing crawl data", () => {
    const observations = [...ACME_SCAN, { ...crawlSite(), kind: "page", value: { status: "200" } }];
    const result = score(observations);
    expect(entry(result, "seo.technical")?.evidence).toMatch(
      /^Crawler data has an unexpected shape \(\d+\.status: /,
    );
    expect(entry(result, "seo.technical")?.score).toBeNull();
  });

  it("needs exactly one readiness observation", () => {
    const result = score([...ACME_SCAN, readiness()]);
    expect(entry(result, "geo.llmsTxt")?.evidence).toBe(
      "Readiness stored no single readiness result",
    );
  });

  it("treats a Search Console day of the wrong shape as missing", () => {
    const [day] = searchConsole([10], []);
    if (!day) throw new Error("expected a day");
    const result = score([...ACME_SCAN, { ...day, value: { impressions: -1 } }]);
    expect(entry(result, "seo.visibility")?.score).toBeNull();
    expect(entry(result, "seo.visibility")?.evidence).toMatch(/^Search Console data has/);
  });
});
