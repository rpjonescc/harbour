import { productSummary } from "./product-summary";

const totals = (seo: number | null, geo: number | null, aeo: number | null) => ({ seo, geo, aeo });

describe("productSummary", () => {
  it("gives the health verdict and the weakest area", () => {
    expect(productSummary("Acme Docs", totals(64, 41, 52))).toBe(
      "Acme Docs is in fair shape. Weakest: Recommended by AI assistants (needs work).",
    );
  });

  it("says needs some work for a low mean", () => {
    expect(productSummary("Acme Docs", totals(40, 30, 20))).toMatch(/^Acme Docs needs some work\./);
  });

  it("leaves out the weakest area when it is strong or the only one scored", () => {
    expect(productSummary("Acme Docs", totals(90, 88, 86))).toBe("Acme Docs is in strong shape.");
    expect(productSummary("Acme Docs", totals(40, null, null))).toBe(
      "Acme Docs needs some work. Some scores are still missing data.",
    );
  });

  it("flags a partly scored product and never counts a gap as zero", () => {
    expect(productSummary("Acme Docs", totals(80, 80, null))).toBe(
      "Acme Docs is in good shape. Some scores are still missing data.",
    );
  });

  it("gives no verdict without scores", () => {
    const none = "Harbour hasn't scored Acme Docs yet, so there's no verdict.";
    expect(productSummary("Acme Docs", null)).toBe(none);
    expect(productSummary("Acme Docs", totals(null, null, null))).toBe(none);
  });
});
