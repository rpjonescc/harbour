import { costs } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { MICRO_PER_AUD } from "./budget";
import { budgetSkipReason, makeSpend, noSpend } from "./guard";
import { recordCost } from "./ledger-write";

const SYDNEY = "Australia/Sydney";
const NOW = new Date("2026-10-15T00:00:00Z");
const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);

function setup(capAud: number, now = NOW, timeZone = "UTC") {
  const db = openTestDb();
  const job = enqueueJob(db, "scan", { productId: "acme-docs" }, null, now);
  const logged: string[] = [];
  const spend = (collector = "rankings") =>
    makeSpend(db, {
      capMicroAud: A$(capAud),
      timeZone,
      now: () => now,
      productId: "acme-docs",
      collector,
      jobId: job.id,
      log: (text) => logged.push(text),
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
  const rows = () => db.select().from(costs).all();
  return { db, job, spend, spent, rows, logged };
}

const call = { provider: "dataforseo", units: 2, amountMicroAud: 1200 };

describe("makeSpend", () => {
  it("records an allowed paid call with the product, collector and job filled in", () => {
    const { rows, job, spend } = setup(1);
    const s = spend();
    expect(s.budget.allow(1500)).toBe(true);
    s.cost.record(call);
    expect(rows()).toEqual([
      {
        id: 1,
        createdAt: NOW,
        status: "recorded",
        provider: "dataforseo",
        collector: "rankings",
        productId: "acme-docs",
        units: 2,
        amountMicroAud: 1200,
        jobId: job.id,
      },
    ]);
    expect(s.failure()).toBeNull();
  });

  it("records a call made without asking the budget, but as the collector's failure", () => {
    const { rows, spend } = setup(1);
    const s = spend();
    s.cost.record(call);
    expect(rows()).toMatchObject([{ status: "recorded", amountMicroAud: 1200 }]);
    expect(s.failure()).toBe("paid call made without budget.allow");
  });

  it("refuses every paid call when no budget is set", () => {
    expect(setup(0).spend().budget.allow(1)).toBe(false);
    expect(setup(0).rows()).toEqual([]);
  });

  it("reads this month's spend on every call", () => {
    const { spend, spent } = setup(1);
    const { budget } = spend();
    expect(budget.allow(A$(0.5))).toBe(true);
    spent(A$(0.9));
    // 0.9 spent + 0.5 still reserved by the first allow: nothing more fits.
    expect(budget.allow(A$(0.01))).toBe(false);
  });

  it("fails closed for an unknown, invalid or zero price", () => {
    const { budget } = setup(10).spend();
    for (const bad of [Number.NaN, -1, 0.5, 0, Number.POSITIVE_INFINITY, A$(100) + 1]) {
      expect(budget.allow(bad), String(bad)).toBe(false);
    }
  });

  it("refuses even a zero estimate once the budget is used up", () => {
    const { spend, spent } = setup(1);
    spent(A$(1));
    expect(spend().budget.allow(0)).toBe(false);
    expect(spend().budget.allow(1)).toBe(false);
  });

  it("reserves each allowed estimate in the ledger, so two calls cannot both pass a check only one fits", () => {
    const { spend, spent, rows } = setup(1);
    spent(A$(0.97));
    const first = spend("rankings");
    const second = spend("aeo-serp");
    expect(first.budget.allow(A$(0.02))).toBe(true);
    expect(rows().at(-1)).toMatchObject({
      status: "reserved",
      collector: "rankings",
      amountMicroAud: A$(0.02),
    });
    // The first call is still in flight: its estimate counts until it is recorded.
    expect(second.budget.allow(A$(0.02))).toBe(false);
    expect(first.budget.allow(A$(0.02))).toBe(false);
  });

  it("settles a reservation when the call is recorded at its actual price", () => {
    const { spend, spent, rows } = setup(1);
    spent(A$(0.96));
    const { budget, cost } = spend();
    expect(budget.allow(A$(0.03))).toBe(true);
    cost.record({ provider: "dataforseo", units: 1, amountMicroAud: A$(0.01) });
    expect(rows().filter((r) => r.status === "reserved")).toEqual([]);
    // 0.97 spent and nothing reserved: exactly 0.03 still fits.
    expect(budget.allow(A$(0.03))).toBe(true);
  });

  it("drops what a collector reserved but never recorded once it ends, and spends no more", () => {
    const { spend, spent, rows } = setup(1);
    spent(A$(0.97));
    const first = spend();
    expect(first.budget.allow(A$(0.02))).toBe(true);
    first.release(false);
    expect(rows().filter((r) => r.status === "reserved")).toEqual([]);
    expect(first.budget.allow(1)).toBe(false);
    expect(spend().budget.allow(A$(0.02))).toBe(true);
  });

  it("keeps an abandoned collector's reservations until its late record settles them", () => {
    const { spend, spent, rows } = setup(1);
    spent(A$(0.97));
    const abandoned = spend();
    expect(abandoned.budget.allow(A$(0.02))).toBe(true);
    abandoned.release(true);
    expect(abandoned.budget.allow(1)).toBe(false);
    expect(spend("aeo-serp").budget.allow(A$(0.02))).toBe(false);
    abandoned.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: A$(0.015) });
    expect(rows().at(-1)).toMatchObject({ status: "recorded", amountMicroAud: A$(0.015) });
    expect(abandoned.failure()).toBeNull();
  });

  it("keeps the reservation of a record the ledger refused, as the collector's failure", () => {
    const { rows, spend } = setup(1);
    const s = spend();
    expect(s.budget.allow(1000)).toBe(true);
    expect(() =>
      s.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: A$(100) + 1 }),
    ).toThrow();
    expect(s.failure()).toMatch(/amountMicroAud/);
    s.release(false);
    // The call may have been billed: its estimate stays counted, shown as unconfirmed.
    expect(rows()).toMatchObject([{ status: "reserved", amountMicroAud: 1000 }]);
  });

  it("logs a refused record that arrives after the collector was abandoned", () => {
    const { spend, logged } = setup(1);
    const s = spend();
    expect(s.budget.allow(1000)).toBe(true);
    s.release(true);
    expect(() => s.cost.record({ provider: "acme-api", units: 1, amountMicroAud: 1 })).toThrow();
    expect(logged).toEqual([
      expect.stringMatching(/^Could not record a paid call's cost: .*provider/),
    ]);
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

describe("noSpend", () => {
  it("gives a free collector no budget and no way to record", () => {
    const free = noSpend("crawler");
    expect(free.budget.allow(1)).toBe(false);
    expect(() => free.cost.record(call)).toThrow(/not a paid collector/);
    expect(free.failure()).toMatch(/not a paid collector/);
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

  it("counts reserved rows, such as one left by a crash mid-call", () => {
    const { db, spend } = setup(60);
    expect(spend().budget.allow(A$(60))).toBe(true);
    expect(budgetSkipReason(db, A$(60), "UTC", NOW)).toMatch(/budget reached/);
  });

  it("only counts the current month", () => {
    const { db, spent } = setup(60);
    spent(A$(80), new Date("2026-09-30T23:59:59Z"));
    expect(budgetSkipReason(db, A$(60), "UTC", NOW)).toBeNull();
  });
});
