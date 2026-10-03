import type { Db } from "@/lib/db/client";
import { openTestDb } from "@/tests/helpers/db";
import { DAY, daysAfter, seedScan } from "@/tests/helpers/scan-views";
import { weeklyScoreChanges } from "./views";

let db: Db;
const now = daysAfter(10);
const scan = (at: Date, seo: number | null, over: { formulaVersion?: string } = {}) =>
  seedScan(db, { productId: "acme-docs", at, totals: { seo, geo: 40, aeo: 30 }, ...over });

beforeEach(() => {
  db = openTestDb();
});

describe("weeklyScoreChanges", () => {
  it("compares the latest score with one exactly 7 days old", () => {
    scan(new Date(now.getTime() - 7 * DAY), 50);
    scan(daysAfter(9), 58);
    expect(weeklyScoreChanges(db, "acme-docs", "product", now)).toEqual({
      seo: { now: 58, before: 50 },
      geo: { now: 40, before: 40 },
      aeo: { now: 30, before: 30 },
    });
  });

  it("takes the newest score at or before 7 days ago, not an older one", () => {
    scan(daysAfter(0), 20);
    scan(daysAfter(2), 45);
    scan(daysAfter(9), 58);
    expect(weeklyScoreChanges(db, "acme-docs", "product", now).seo).toEqual({
      now: 58,
      before: 45,
    });
  });

  it("is a gap with no score that old, or with no score this week", () => {
    scan(daysAfter(5), 50);
    scan(daysAfter(9), 58);
    expect(weeklyScoreChanges(db, "acme-docs", "product", now).seo).toBeNull();
    db = openTestDb();
    scan(daysAfter(1), 50); // the latest is itself over a week old: nothing to compare
    expect(weeklyScoreChanges(db, "acme-docs", "product", now)).toEqual({
      seo: null,
      geo: null,
      aeo: null,
    });
  });

  it("is a gap where either score is missing", () => {
    scan(daysAfter(1), null);
    scan(daysAfter(9), 58);
    expect(weeklyScoreChanges(db, "acme-docs", "product", now).seo).toBeNull();
  });

  it("is a gap only in the areas a formula change touched between the two", () => {
    scan(daysAfter(1), 50, { formulaVersion: "v1" });
    scan(daysAfter(9), 58, { formulaVersion: "v2" });
    // v2 changed AEO for products, and nothing for news sites.
    expect(weeklyScoreChanges(db, "acme-docs", "product", now)).toEqual({
      seo: { now: 58, before: 50 },
      geo: { now: 40, before: 40 },
      aeo: null,
    });
    expect(weeklyScoreChanges(db, "acme-docs", "news", now).aeo).toEqual({ now: 30, before: 30 });
  });

  it("ignores the scores of a failed scan", () => {
    scan(daysAfter(1), 50);
    const totals = { seo: 99, geo: 99, aeo: 99 };
    seedScan(db, { productId: "acme-docs", at: daysAfter(9), status: "failed", totals });
    expect(weeklyScoreChanges(db, "acme-docs", "product", now).seo).toBeNull();
  });
});
