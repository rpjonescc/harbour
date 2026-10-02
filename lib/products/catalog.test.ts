import { todaySummary } from "@/lib/today/from-scans";
import { queueScans } from "@/scripts/scan-now";
import { openTestDb } from "@/tests/helpers/db";
import { getContentProducts, getProducts, productById } from "./catalog";

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

  it("lists a content-only project as a content product but not as a product", () => {
    expect(getProducts().map((p) => p.id)).not.toContain("acme-tools");
    expect(() => productById("acme-tools")).toThrow(/Unknown product/);
    expect(getContentProducts().map((p) => [p.id, p.kind])).toEqual([
      ["acme-docs", "site"],
      ["acme-tools", "project"],
    ]);
  });

  it("keeps a project out of Today and out of scans", () => {
    const summary = todaySummary(
      openTestDb(),
      getProducts(),
      new Date("2026-10-02T09:00:00Z"),
      "ok",
    );
    expect(summary.scores.map((row) => row.productId)).toEqual([
      "acme-docs",
      "lighthouse-cafe",
      "fern-and-field",
    ]);
    const queued = queueScans(openTestDb(), getProducts());
    expect(queued.map((job) => job.productId)).not.toContain("acme-tools");
    expect(queued).toHaveLength(3);
    expect(() => queueScans(openTestDb(), getProducts(), "acme-tools")).toThrow(/Unknown product/);
  });
});
