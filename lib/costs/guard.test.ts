import { costs } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { MICRO_PER_AUD } from "./budget";
import { budgetSkipReason, makeSpend } from "./guard";
import { recordCost } from "./ledger";

const SYDNEY = "Australia/Sydney";
const NOW = new Date("2026-10-15T00:00:00Z");
const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);

function setup(capAud: number, now = NOW, timeZone = "UTC") {
  const db = openTestDb();
  const job = enqueueJob(db, "scan", { productId: "acme-docs" }, null, now);
  const spend = (collector = "rankings") =>
    makeSpend(db, {
      capMicroAud: A$(capAud),
      timeZone,
      now: () => now,
      productId: "acme-docs",
      collector,
      jobId: job.id,
    });
  const spent = (amountMicroAud: number, at = now) =>
    recordCost(
      db,
      {
        provider: "openai",
        collector: "ai-engines",
        productId: null,
        units: 1,
        amountMicroAud,
        jobId: null,
      },
      at,
    );
  return { db, job, spend, spent };
}

describe("makeSpend", () => {
  it("records a paid call with the product, collector and job filled in", () => {
    const { db, job, spend } = setup(1);
    spend().cost.record({ provider: "dataforseo", units: 2, amountMicroAud: 1200 });
    expect(db.select().from(costs).all()).toEqual([
      {
        id: 1,
        createdAt: NOW,
        provider: "dataforseo",
        collector: "rankings",
        productId: "acme-docs",
        units: 2,
        amountMicroAud: 1200,
        jobId: job.id,
      },
    ]);
  });

  it("refuses every paid call when no budget is set", () => {
    expect(setup(0).spend().budget.allow(0)).toBe(false);
    expect(setup(0).spend().budget.allow(1)).toBe(false);
  });

  it("reads this month's spend on every call", () => {
    const { spend, spent } = setup(1);
    const { budget } = spend();
    expect(budget.allow(A$(0.5))).toBe(true);
    spent(A$(0.9));
    // 0.9 spent + 0.5 still reserved by the first allow: nothing more fits.
    expect(budget.allow(A$(0.01))).toBe(false);
  });

  it("fails closed for an unknown or invalid price", () => {
    const { budget } = setup(10).spend();
    for (const bad of [Number.NaN, -1, 0.5, Number.POSITIVE_INFINITY, A$(100) + 1]) {
      expect(budget.allow(bad), String(bad)).toBe(false);
    }
  });

  it("reserves each allowed estimate so two calls cannot both pass a check only one fits", () => {
    const { spend, spent } = setup(1);
    spent(A$(0.97));
    const first = spend("rankings");
    const second = spend("aeo-serp");
    expect(first.budget.allow(A$(0.02))).toBe(true);
    // The first call is still in flight: its estimate counts until it is recorded.
    expect(second.budget.allow(A$(0.02))).toBe(false);
    expect(first.budget.allow(A$(0.02))).toBe(false);
  });

  it("settles a reservation when the call is recorded at its actual price", () => {
    const { spend, spent } = setup(1);
    spent(A$(0.96));
    const { budget, cost } = spend();
    expect(budget.allow(A$(0.03))).toBe(true);
    cost.record({ provider: "dataforseo", units: 1, amountMicroAud: A$(0.01) });
    // 0.97 spent and nothing reserved: exactly 0.03 still fits.
    expect(budget.allow(A$(0.03))).toBe(true);
  });

  it("frees what a collector reserved but never recorded once it finishes", () => {
    const { spend, spent } = setup(1);
    spent(A$(0.97));
    const first = spend();
    expect(first.budget.allow(A$(0.02))).toBe(true);
    first.release();
    expect(spend().budget.allow(A$(0.02))).toBe(true);
  });

  it("keeps a record the ledger refused as the collector's failure", () => {
    const { db, spend } = setup(1);
    const s = spend();
    expect(() =>
      s.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: A$(100) + 1 }),
    ).toThrow();
    expect(s.failure()).toMatch(/amountMicroAud/);
    expect(db.select().from(costs).all()).toEqual([]);
  });

  it("counts a row at 23:30 local on 31 Oct for October in the configured zone", () => {
    // 23:30 AEDT (+11) on 31 Oct is 12:30 UTC.
    const lateOctober = new Date("2026-10-31T12:30:00Z");
    const october = setup(1, new Date("2026-10-31T12:45:00Z"), SYDNEY);
    october.spent(A$(1), lateOctober);
    expect(october.spend().budget.allow(1)).toBe(false);

    // 00:30 on 1 Nov in Sydney: a new month with nothing spent yet.
    const november = setup(1, new Date("2026-10-31T13:30:00Z"), SYDNEY);
    november.spent(A$(1), lateOctober);
    expect(november.spend().budget.allow(A$(1))).toBe(true);
  });
});

describe("budgetSkipReason", () => {
  it("names the missing setting when no budget is set", () => {
    const { db } = setup(0);
    expect(budgetSkipReason(db, 0, "UTC", NOW)).toBe(
      "budget: no monthly budget set (HARBOUR_MONTHLY_BUDGET_AUD)",
    );
  });

  it("is null while this month's spend is under the cap", () => {
    const { db, spent } = setup(60);
    spent(A$(59.99));
    expect(budgetSkipReason(db, A$(60), "UTC", NOW)).toBeNull();
  });

  it("says the budget is reached, with what was spent, at 100 %", () => {
    const { db, spent } = setup(60);
    spent(A$(60.12));
    expect(budgetSkipReason(db, A$(60), "UTC", NOW)).toBe(
      "budget: A$60.00 monthly budget reached (A$60.12 spent)",
    );
  });

  it("only counts the current month", () => {
    const { db, spent } = setup(60);
    spent(A$(80), new Date("2026-09-30T23:59:59Z"));
    expect(budgetSkipReason(db, A$(60), "UTC", NOW)).toBeNull();
  });
});
