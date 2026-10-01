import {
  ACME_SCAN,
  crawlSite,
  entryOf as entry,
  readiness,
  scoreOf as score,
  searchConsole,
} from "@/tests/helpers/scoring";

describe("scoreScan with partly unknown inputs", () => {
  it("marks SEO incomplete for a partial sitemap and unreadable robots.txt", () => {
    const unread = { state: "unavailable", valid: null, googlebot: null, aiCrawlerAccess: null };
    const partial = {
      ...{ reachable: true, valid: true, sitemapsRead: 1, urlCount: 5, partial: true },
      errors: [{ url: "https://docs.example.com/sitemap-blog.xml", status: 500 }],
      offOrigin: [],
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
        "Incomplete: sitemap partial: 1 same-origin sitemap could not be read " +
        "(https://docs.example.com/sitemap-blog.xml: HTTP 500), so the URL count covers only " +
        "the 1 read; robots.txt could not be read, so Googlebot's access is unknown.",
    });
    expect(entry(result, "geo.aiCrawlers")?.evidence).toBe(
      "robots.txt could not be read (unavailable): AI crawler access unknown",
    );
    expect(result?.complete).toEqual({ seo: false, geo: false, aeo: true });
    // SEO still scores: 0.35 × 72 + 0.25 × 88 + 0.2 × 76 + 0.2 × 89 = 80.2
    expect(result?.seo).toBe(80);
  });
});

describe("scoreScan with a sitemap it could not check", () => {
  const sitemap = (value: Record<string, unknown>) => ({
    ...{ reachable: false, valid: null, sitemapsRead: 0, urlCount: null, partial: false },
    ...{ errors: [], offOrigin: [] },
    ...value,
  });
  // With no sitemap read, the crawl had no sitemap URLs to check either.
  const withSitemap = (value: Record<string, unknown>) => [
    ...ACME_SCAN.filter((o) => o.collector !== "readiness" && o.kind !== "site"),
    crawlSite({ sitemapPages: null }),
    readiness({ sitemap: sitemap(value) }),
  ];

  it("leaves out a sitemap that answered 503 instead of scoring it invalid", () => {
    const errors = [{ url: "https://docs.example.com/sitemap.xml", status: 503 }];
    const result = score(withSitemap({ errors }));
    expect(entry(result, "seo.indexability")).toMatchObject({
      // only Googlebot's access remains: 1 → 100
      score: 100,
      status: "ok",
      evidence:
        "Googlebot allowed (some paths disallowed). Incomplete: sitemap could not be fetched " +
        "(https://docs.example.com/sitemap.xml: HTTP 503).",
    });
    expect(result?.complete.seo).toBe(false);
  });

  it("scores a listed sitemap that answers 404 as a defect, not a gap", () => {
    const errors = [{ url: "https://docs.example.com/sitemap-docs.xml", status: 404 }];
    const result = score(withSitemap({ errors }));
    expect(entry(result, "seo.indexability")).toMatchObject({
      score: 50,
      evidence:
        "Sitemap listed but answers HTTP 404 (https://docs.example.com/sitemap-docs.xml); " +
        "Googlebot allowed (some paths disallowed).",
    });
    expect(result?.complete.seo).toBe(true);
  });

  it("treats a sitemap answering 429 as unknown", () => {
    const errors = [{ url: "https://docs.example.com/sitemap.xml", status: 429 }];
    const result = score(withSitemap({ errors }));
    expect(entry(result, "seo.indexability")?.score).toBe(100);
    expect(result?.complete.seo).toBe(false);
  });

  it("counts one sitemap URL in the singular", () => {
    const result = score(withSitemap({ valid: true, sitemapsRead: 1, urlCount: 1 }));
    expect(entry(result, "seo.indexability")?.evidence).toMatch(/^Sitemap valid \(1 URL\);/);
  });

  it("names a fetch failure by its kind", () => {
    const errors = [{ url: "https://docs.example.com/sitemap.xml", kind: "timeout" }];
    expect(entry(score(withSitemap({ errors })), "seo.indexability")?.evidence).toContain(
      "sitemap could not be fetched (https://docs.example.com/sitemap.xml: timeout)",
    );
  });

  it("scores a sitemap that did not parse as invalid", () => {
    const errors = [{ url: "https://docs.example.com/sitemap.xml", kind: "invalid" }];
    const result = score(withSitemap({ valid: false, errors }));
    expect(entry(result, "seo.indexability")).toMatchObject({
      score: 50,
      evidence: "Sitemap invalid (1 did not parse); Googlebot allowed (some paths disallowed).",
    });
    expect(result?.complete.seo).toBe(true);
  });

  it("notes a sitemap on another origin without marking SEO incomplete", () => {
    const offOrigin = ["https://example.com/sitemap.xml"];
    const errors = [{ url: offOrigin[0], kind: "off_origin" }];
    const result = score(withSitemap({ errors, offOrigin }));
    expect(entry(result, "seo.indexability")).toMatchObject({
      score: 100,
      evidence:
        "Sitemap on another origin, not checked (https://example.com/sitemap.xml); Googlebot " +
        "allowed (some paths disallowed).",
    });
    expect(result?.complete.seo).toBe(true);
  });

  it("is missing when nothing about indexability could be checked", () => {
    const errors = [{ url: "https://docs.example.com/sitemap.xml", status: 503 }];
    const robotsTxt = { state: "unavailable", valid: null, googlebot: null, aiCrawlerAccess: null };
    const observations = [
      ...ACME_SCAN.filter((o) => o.collector !== "readiness" && o.kind !== "site"),
      crawlSite({ sitemapPages: null }),
      readiness({ robotsTxt, sitemap: sitemap({ errors }) }),
    ];
    expect(entry(score(observations), "seo.indexability")).toMatchObject({
      score: null,
      status: "missing",
      evidence:
        "Nothing to score: sitemap could not be fetched (https://docs.example.com/sitemap.xml: " +
        "HTTP 503); robots.txt could not be read, so Googlebot's access is unknown",
    });
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
    expect(entry(result, "seo.searchTrend")?.score).toBeNull();
    expect(entry(result, "seo.searchTrend")?.evidence).toMatch(/^Search Console data has/);
  });
});
