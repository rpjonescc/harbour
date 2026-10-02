import type { Product } from "@/lib/products/catalog";
import { sampleToday } from "./sample";

const products: Product[] = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" },
  { id: "lighthouse-cafe", name: "Lighthouse Café", url: "https://l.example.com", hue: "blue" },
  { id: "fern-and-field", name: "Fern & Field", url: "https://f.example.com", hue: "green" },
];

describe("sampleToday", () => {
  it("is clearly marked as sample data and covers every configured product", () => {
    const today = sampleToday(products);
    expect(today.isSample).toBe(true);
    expect(today.scannedAt).toBeNull();
    expect(today.scores.map((s) => s.productId)).toEqual(products.map((p) => p.id));
  });

  it("is deterministic for the same products", () => {
    expect(sampleToday(products)).toEqual(sampleToday(products));
  });

  it("derives different scores for different products", () => {
    const [a, b] = sampleToday(products).scores;
    expect(a?.totals).not.toEqual(b?.totals);
  });

  it("keeps scores within 0–100 and ends the trend at today's SEO score", () => {
    for (const s of sampleToday(products).scores) {
      for (const v of [s.totals.seo, s.totals.geo, s.totals.aeo, ...s.trend]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(s.trend.at(-1)).toBe(s.totals.seo);
    }
  });

  it("references configured products in its two generic actions", () => {
    const { actions } = sampleToday(products);
    expect(actions.map((a) => [a.productId, a.area])).toEqual([
      ["acme-docs", "GEO"],
      ["lighthouse-cafe", "AEO"],
    ]);
  });

  it("briefs from its own sample scores and actions, and from real source failures", () => {
    expect(sampleToday(products).briefing).toEqual({
      sentence:
        "Your sites need some work. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).",
      subLine: "2 things worth doing · nothing is broken",
    });
    const failing = sampleToday(products, [
      { productId: "acme-docs", collector: "crawler", error: "Could not crawl" },
    ]);
    expect(failing.failures).toHaveLength(1);
    expect(failing.briefing.subLine).toBe(
      "2 things worth doing · Page check had a problem in the last check",
    );
  });

  it("works with a single product", () => {
    const today = sampleToday(products.slice(0, 1));
    expect(today.actions.every((a) => a.productId === "acme-docs")).toBe(true);
  });
});
