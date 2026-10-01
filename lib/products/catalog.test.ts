import { getProducts, productById } from "./catalog";

// vitest.config.mts points HARBOUR_CONFIG_PATH at the example config.
describe("product catalog", () => {
  it("lists the configured products in display order", () => {
    expect(getProducts().map((p) => p.id)).toEqual([
      "acme-docs",
      "lighthouse-cafe",
      "fern-and-field",
    ]);
  });

  it("looks up a product by id", () => {
    expect(productById("lighthouse-cafe").url).toBe("https://lighthouse-cafe.example.com");
    expect(productById("acme-docs").hue).toBe("amber");
  });

  it("throws for an unknown id", () => {
    expect(() => productById("nope")).toThrow(/Unknown product: nope/);
  });
});
