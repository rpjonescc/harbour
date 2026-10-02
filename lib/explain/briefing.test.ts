import { type BriefingInput, buildBriefing } from "./briefing";

const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "fern-and-field", name: "Fern & Field" },
];
const totals = (seo: number | null, geo: number | null, aeo: number | null) => ({ seo, geo, aeo });
const input = (over: Partial<BriefingInput>): BriefingInput => ({
  products: PRODUCTS,
  scores: [],
  work: [],
  failures: [],
  failedChecks: [],
  backup: "ok",
  ...over,
});

describe("buildBriefing", () => {
  it("healthy: strong scores, nothing to do, nothing broken", () => {
    const briefing = buildBriefing(
      input({
        scores: [
          { productId: "acme-docs", totals: totals(90, 88, 86) },
          { productId: "fern-and-field", totals: totals(92, 85, 95) },
        ],
      }),
    );
    expect(briefing).toEqual({
      sentence: "Your sites are in strong shape.",
      subLine: "Nothing on the to-do list · nothing is broken",
    });
  });

  it("names the lowest-scoring area that has an active action as the biggest opportunity", () => {
    const briefing = buildBriefing(
      input({
        scores: [
          { productId: "acme-docs", totals: totals(72, 40, 66) },
          // Fern & Field's 30 is lower, but nothing is open for it.
          { productId: "fern-and-field", totals: totals(80, 30, 55) },
        ],
        work: [
          { productId: "acme-docs", area: "GEO", who: "you" },
          { productId: "acme-docs", area: "SEO", who: "claude" },
          { productId: "fern-and-field", area: "AEO", who: "pr_waiting" },
        ],
      }),
    );
    expect(briefing).toEqual({
      sentence:
        "Your sites are in fair shape. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).",
      subLine: "3 things worth doing · Claude is handling 1 · nothing is broken",
    });
  });

  it("breaks ties by product order, then area order", () => {
    const briefing = buildBriefing(
      input({
        scores: [
          { productId: "acme-docs", totals: totals(60, 60, 90) },
          { productId: "fern-and-field", totals: totals(60, 90, 90) },
        ],
        work: [
          { productId: "fern-and-field", area: "SEO", who: "you" },
          { productId: "acme-docs", area: "GEO", who: "you" },
          { productId: "acme-docs", area: "SEO", who: "you" },
        ],
      }),
    );
    expect(briefing.sentence).toBe(
      "Your sites are in good shape. Biggest opportunity: Found on Google for Acme Docs (fair).",
    );
  });

  it("skips an area with no score: a gap is never the lowest", () => {
    const briefing = buildBriefing(
      input({
        scores: [{ productId: "acme-docs", totals: totals(null, 75, 60) }],
        work: [
          { productId: "acme-docs", area: "SEO", who: "you" },
          { productId: "acme-docs", area: "GEO", who: "you" },
        ],
      }),
    );
    expect(briefing.sentence).toBe(
      "Your sites are in fair shape. Biggest opportunity: Recommended by AI assistants for Acme Docs (good).",
    );
  });

  it("broken: names the failing data source, once, in the sub-line", () => {
    const one = buildBriefing(
      input({
        scores: [{ productId: "acme-docs", totals: totals(90, 90, 90) }],
        failures: [
          { productId: "acme-docs", collector: "pagespeed" },
          { productId: "fern-and-field", collector: "pagespeed" },
        ],
      }),
    );
    expect(one.subLine).toBe(
      "Nothing on the to-do list · Google speed test (PageSpeed) had a problem in the last check",
    );
    const two = buildBriefing(
      input({
        failures: [
          { productId: "acme-docs", collector: "pagespeed" },
          { productId: "acme-docs", collector: "search-console" },
        ],
      }),
    );
    expect(two.subLine).toBe(
      "Nothing on the to-do list · 2 data sources had a problem in the last check",
    );
  });

  it.each([
    ["failed", "the last backup didn't finish"],
    ["stale", "no backup in the last 2 days"],
    ["unreadable", "Harbour can't open the backup folder"],
  ] as const)("broken: names a %s backup in the sub-line", (backup, trouble) => {
    expect(buildBriefing(input({ backup })).subLine).toBe(`Nothing on the to-do list · ${trouble}`);
  });

  it.each(["ok", "none-yet", "off"] as const)("a %s backup is not broken", (backup) => {
    expect(buildBriefing(input({ backup })).subLine).toBe(
      "Nothing on the to-do list · nothing is broken",
    );
  });

  it("broken: names a check that failed outright, unless its failing sources already say so", () => {
    expect(buildBriefing(input({ failedChecks: ["fern-and-field"] })).subLine).toBe(
      "Nothing on the to-do list · the last check for Fern & Field didn't finish",
    );
    expect(buildBriefing(input({ failedChecks: ["acme-docs", "fern-and-field"] })).subLine).toBe(
      "Nothing on the to-do list · the last check for 2 sites didn't finish",
    );
    const covered = input({
      failedChecks: ["acme-docs"],
      failures: [{ productId: "acme-docs", collector: "crawler" }],
    });
    expect(buildBriefing(covered).subLine).toBe(
      "Nothing on the to-do list · Page check had a problem in the last check",
    );
    const oneSite = { ...input({ failedChecks: ["acme-docs"] }), products: PRODUCTS.slice(0, 1) };
    expect(buildBriefing(oneSite).subLine).toBe(
      "Nothing on the to-do list · the last check didn't finish",
    );
  });

  it("broken: names every kind of trouble, checks first and the backup last", () => {
    const briefing = buildBriefing(
      input({
        work: [{ productId: "acme-docs", area: "SEO", who: "claude" }],
        failedChecks: ["fern-and-field"],
        failures: [{ productId: "acme-docs", collector: "pagespeed" }],
        backup: "failed",
      }),
    );
    expect(briefing.subLine).toBe(
      "1 thing worth doing · Claude is handling 1 · the last check for Fern & Field didn't finish · " +
        "Google speed test (PageSpeed) had a problem in the last check · the last backup didn't finish",
    );
  });

  // Review Focus 2: a product scanned with every area missing.
  it("no data: says there is no verdict rather than a bad one", () => {
    const briefing = buildBriefing(
      input({
        scores: [{ productId: "acme-docs", totals: totals(null, null, null) }],
        work: [{ productId: "acme-docs", area: "SEO", who: "you" }],
      }),
    );
    expect(briefing).toEqual({
      sentence: "Harbour has no scores yet, so there's no verdict.",
      subLine: "1 thing worth doing · nothing is broken",
    });
  });

  it("speaks of one site when one product is configured", () => {
    const briefing = buildBriefing({
      products: PRODUCTS.slice(0, 1),
      scores: [{ productId: "acme-docs", totals: totals(30, 40, 20) }],
      work: [],
      failures: [],
      failedChecks: [],
      backup: "ok",
    });
    expect(briefing.sentence).toBe("Your site needs some work.");
  });
});
