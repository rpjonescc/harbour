import { insertAction } from "@/lib/actions/store";
import { enqueueJob } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import type { Observation } from "@/lib/scan/types";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { daysAfter, seedScan, T0 } from "@/tests/helpers/scan-views";
import { htmlPage } from "@/tests/helpers/scoring";
import { headlineFor, todaySummary } from "./from-scans";
import { sampleToday } from "./sample";

const products: Product[] = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" },
  { id: "fern-and-field", name: "Fern & Field", url: "https://fern.example.com", hue: "green" },
];
const obs = ({
  kind,
  subject,
  value,
}: {
  kind: string;
  subject: string;
  value: Record<string, unknown>;
}): Observation => ({ kind, subject, value });

describe("todaySummary", () => {
  it("is the sample until some product has scores, saying when the first scan is running", () => {
    const db = openTestDb();
    expect(todaySummary(db, products, T0)).toMatchObject({ isSample: true, scanning: false });
    enqueueJob(db, "scan", { productId: "acme-docs" }, null, T0);
    expect(todaySummary(db, products, T0)).toMatchObject({ isSample: true, scanning: true });
  });

  it("keeps the sample's actions until some product has scores, whatever actions exist", () => {
    const db = openTestDb();
    insertAction(db, ruleAction({ impact: "high" }), "scan", null, T0);
    const today = todaySummary(db, products, T0);
    const sample = sampleToday(products);
    expect(today.headline).toBe(sample.headline);
    expect(today.actions).toEqual(sample.actions);
    expect(today.moreActions).toBe(0);
  });

  it("before any scores, says the last scan failed and keeps its failing sources", () => {
    const db = openTestDb();
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      status: "failed",
      scored: false,
      runs: [{ collector: "crawler", status: "failed", error: "Could not crawl" }],
    });
    expect(todaySummary(db, products, T0)).toMatchObject({
      isSample: true,
      scannedAt: null,
      lastFailedAt: daysAfter(-1),
      failures: [{ productId: "acme-docs", collector: "crawler", error: "Could not crawl" }],
    });
  });

  it("summarises real scores, the top active actions and failing sources", () => {
    const db = openTestDb();
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      totals: { seo: 50, geo: 40, aeo: 30 },
    });
    seedScan(db, {
      productId: "acme-docs",
      at: T0,
      totals: { seo: 52, geo: 40, aeo: null },
      complete: { seo: true, geo: true, aeo: false },
      status: "partial",
      runs: [
        {
          collector: "crawler",
          status: "ok",
          observations: [obs(htmlPage("/", { title: null, titleLength: 0, descriptionLength: 0 }))],
        },
        { collector: "pagespeed", status: "failed", error: "PageSpeed Insights quota exceeded" },
      ],
    });
    enqueueJob(db, "scan", { productId: "fern-and-field" }, null, T0);
    const today = todaySummary(db, products, T0);
    expect(today).toMatchObject({
      isSample: false,
      scannedAt: T0,
      scanning: true,
      failures: [
        {
          productId: "acme-docs",
          collector: "pagespeed",
          error: "PageSpeed Insights quota exceeded",
        },
      ],
    });
    expect(today?.scores).toEqual([
      {
        productId: "acme-docs",
        totals: { seo: 52, geo: 40, aeo: null },
        complete: { seo: true, geo: true, aeo: false },
        deltas: { seo: 2, geo: 0, aeo: null },
        trend: [50, 52],
      },
      {
        productId: "fern-and-field",
        totals: { seo: null, geo: null, aeo: null },
        complete: { seo: false, geo: false, aeo: false },
        deltas: { seo: null, geo: null, aeo: null },
        trend: [],
      },
    ]);
    // The scan found issues, but Today reads actions: none exist yet.
    expect(today.headline).toBe("Calm waters. Nothing needs your attention.");
    expect(today.actions).toEqual([]);
    expect(today.moreActions).toBe(0);
  });

  it("counts active actions in the headline and shows the top three", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: T0, totals: { seo: 52, geo: 40, aeo: 30 } });
    const add = (title: string, over: Parameters<typeof ruleAction>[0]) =>
      insertAction(db, ruleAction({ title, ruleKey: title, ...over }), "scan", null, T0);
    const top = add("Pages have no title", { impact: "high" });
    add("Add meta descriptions", { impact: "medium" });
    add("Allow AI crawlers", { impact: "low", area: "GEO" });
    add("Publish llms.txt", { impact: "low", area: "GEO", productId: "fern-and-field" });
    add("Snoozed", { impact: "high", status: "snoozed", snoozedUntil: "2026-10-12" });
    const today = todaySummary(db, products, T0);
    expect(today.headline).toBe("Four things worth your attention.");
    expect(today.actions.map((a) => [a.title, a.impact])).toEqual([
      ["Pages have no title", "high"],
      ["Add meta descriptions", "medium"],
      ["Allow AI crawlers", "low"],
    ]);
    expect(today.actions[0]?.href).toBe(`/actions#action-${top}`);
    expect(today.moreActions).toBe(1);
  });
});

describe("headlineFor", () => {
  it("is calm without issues or without high-impact ones", () => {
    expect(headlineFor([])).toBe("Calm waters. Nothing needs your attention.");
    expect(headlineFor([{ impact: "low" }])).toBe("Calm waters. One thing worth your attention.");
    expect(headlineFor([{ impact: "high" }, { impact: "low" }])).toBe(
      "Two things worth your attention.",
    );
  });

  it("uses digits past ten", () => {
    expect(headlineFor(Array.from({ length: 12 }, () => ({ impact: "high" as const })))).toBe(
      "12 things worth your attention.",
    );
  });
});
