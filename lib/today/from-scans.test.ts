import { insertAction } from "@/lib/actions/store";
import { enqueueJob } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import type { Observation } from "@/lib/scan/types";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { daysAfter, seedScan, T0 } from "@/tests/helpers/scan-views";
import { htmlPage } from "@/tests/helpers/scoring";
import { todaySummary } from "./from-scans";
import { sampleToday } from "./sample";

const products: Product[] = [
  {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber",
    kind: "product" as const,
  },
  {
    id: "fern-and-field",
    name: "Fern & Field",
    url: "https://fern.example.com",
    hue: "green",
    kind: "product" as const,
  },
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
    expect(todaySummary(db, products, T0, "ok")).toMatchObject({ isSample: true, scanning: false });
    enqueueJob(db, "scan", { productId: "acme-docs" }, null, T0);
    expect(todaySummary(db, products, T0, "ok")).toMatchObject({ isSample: true, scanning: true });
  });

  it("keeps the sample's actions until some product has scores, whatever actions exist", () => {
    const db = openTestDb();
    insertAction(db, ruleAction({ impact: "high" }), "scan", null, T0);
    const today = todaySummary(db, products, T0, "ok");
    const sample = sampleToday(products);
    expect(today.briefing).toEqual(sample.briefing);
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
    expect(todaySummary(db, products, T0, "ok")).toMatchObject({
      isSample: true,
      scannedAt: null,
      lastFailedAt: daysAfter(-1),
      failures: [{ productId: "acme-docs", collector: "crawler", error: "Could not crawl" }],
    });
    expect(todaySummary(db, products, T0, "ok").briefing.subLine).toBe(
      "2 things worth doing · Page check had a problem in the last check",
    );
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
    const today = todaySummary(db, products, T0, "ok");
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
        scanned: true,
        lastCheckFailed: false,
        totals: { seo: 52, geo: 40, aeo: null },
        complete: { seo: true, geo: true, aeo: false },
        deltas: { seo: 2, geo: 0, aeo: null },
        trend: [50, 52],
      },
      {
        productId: "fern-and-field",
        scanned: false,
        lastCheckFailed: false,
        totals: { seo: null, geo: null, aeo: null },
        complete: { seo: false, geo: false, aeo: false },
        deltas: { seo: null, geo: null, aeo: null },
        trend: [],
      },
    ]);
    // The scan found issues, but Today reads actions: none exist yet.
    expect(today.briefing).toEqual({
      sentence: "Your sites need some work.",
      subLine:
        "Nothing on the to-do list · Google speed test (PageSpeed) had a problem in the last check",
    });
    expect(today.actions).toEqual([]);
    expect(today.moreActions).toBe(0);
  });

  it("tells a product whose only check failed from one never checked", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: T0, totals: { seo: 90, geo: 90, aeo: 90 } });
    seedScan(db, {
      productId: "fern-and-field",
      at: T0,
      status: "failed",
      scored: false,
      runs: [],
    });
    const today = todaySummary(db, products, T0, "ok");
    expect(today.scores.map((r) => [r.productId, r.scanned, r.lastCheckFailed])).toEqual([
      ["acme-docs", true, false],
      ["fern-and-field", false, true],
    ]);
    // No source is listed as failing, so the briefing names the check itself.
    expect(today.briefing.subLine).toBe(
      "Nothing on the to-do list · the last check for Fern & Field didn't finish",
    );
  });

  it("names a backup that needs a look in the briefing, sample or not", () => {
    const db = openTestDb();
    expect(todaySummary(db, products, T0, "stale").briefing.subLine).toBe(
      "2 things worth doing · no backup in the last 2 days",
    );
    seedScan(db, { productId: "acme-docs", at: T0, totals: { seo: 90, geo: 90, aeo: 90 } });
    expect(todaySummary(db, products, T0, "failed").briefing.subLine).toBe(
      "Nothing on the to-do list · the last backup didn't finish",
    );
  });

  it("briefs on the active actions and shows the top three", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: T0, totals: { seo: 52, geo: 40, aeo: 30 } });
    const add = (title: string, over: Parameters<typeof ruleAction>[0]) =>
      insertAction(db, ruleAction({ title, ruleKey: title, ...over }), "scan", null, T0);
    const top = add("Pages have no title", { impact: "high" });
    add("Add meta descriptions", { impact: "medium" });
    add("Allow AI crawlers", { impact: "low", area: "GEO" });
    add("Publish llms.txt", { impact: "low", area: "GEO", productId: "fern-and-field" });
    add("Snoozed", { impact: "high", status: "snoozed", snoozedUntil: "2026-10-12" });
    const today = todaySummary(db, products, T0, "ok");
    expect(today.briefing).toEqual({
      sentence:
        "Your sites need some work. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).",
      subLine: "4 things worth doing · nothing is broken",
    });
    expect(today.actions.map((a) => [a.title, a.impact])).toEqual([
      ["Pages have no title", "high"],
      ["Add meta descriptions", "medium"],
      ["Allow AI crawlers", "low"],
    ]);
    expect(today.actions[0]?.href).toBe(`/actions#action-${top}`);
    expect(today.moreActions).toBe(1);
  });

  it("briefs only on configured products' scores and actions", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: T0, totals: { seo: 52, geo: 40, aeo: 30 } });
    insertAction(db, ruleAction({ area: "SEO" }), "scan", null, T0);
    const before = todaySummary(db, products, T0, "ok").briefing;
    // A strong, busy product that is no longer configured would lift health to "good".
    seedScan(db, {
      productId: "retired-product",
      at: T0,
      totals: { seo: 100, geo: 100, aeo: 100 },
    });
    insertAction(db, ruleAction({ productId: "retired-product", area: "GEO" }), "scan", null, T0);
    expect(todaySummary(db, products, T0, "ok").briefing).toEqual(before);
    expect(before).toEqual({
      sentence:
        "Your sites need some work. Biggest opportunity: Found on Google for Acme Docs (fair).",
      subLine: "1 thing worth doing · nothing is broken",
    });
  });
});
