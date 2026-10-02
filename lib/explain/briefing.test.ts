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
    });
    expect(briefing.sentence).toBe("Your site needs some work.");
  });
});
