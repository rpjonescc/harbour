import { parseProductConfig } from "./config";
import { contentProducts } from "./content";

const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" },
  { id: "lighthouse-cafe", name: "Lighthouse Café", url: "https://cafe.example.com", hue: "blue" },
];

describe("content config", () => {
  it("enables content only for products with an entry, defaulting to all six platforms", () => {
    const config = parseProductConfig({
      products,
      content: { products: { "acme-docs": { terms: ["acme docs", "acme-docs"] } } },
    });
    const enabled = contentProducts(config);
    expect(enabled.map((p) => p.id)).toEqual(["acme-docs"]);
    expect(enabled[0]).toMatchObject({
      terms: ["acme docs", "acme-docs"],
      platforms: ["linkedin", "x", "instagram", "facebook", "blog", "website"],
    });
  });

  it("is empty when there is no content block", () => {
    expect(contentProducts(parseProductConfig({ products }))).toEqual([]);
  });

  it.each([
    ["no terms", { terms: [] }],
    ["11 terms", { terms: Array.from({ length: 11 }, (_, i) => `term ${i}`) }],
    ["a one-character term", { terms: ["a"] }],
    ["a 41-character term", { terms: ["a".repeat(41)] }],
    ["an unknown platform", { terms: ["acme"], platforms: ["tiktok"] }],
    ["a repeated platform", { terms: ["acme"], platforms: ["x", "x"] }],
    ["an unknown key", { terms: ["acme"], schedule: "daily" }],
  ])("rejects %s", (_label, entry) => {
    expect(() =>
      parseProductConfig({ products, content: { products: { "acme-docs": entry } } }),
    ).toThrow();
  });

  it("rejects a content entry for a product that is not configured, and Postiz settings", () => {
    expect(() =>
      parseProductConfig({ products, content: { products: { ghost: { terms: ["boo"] } } } }),
    ).toThrow(/ghost/);
    expect(() =>
      parseProductConfig({ products, content: { postiz: { channels: { x: "c1" } } } }),
    ).toThrow();
  });
});
