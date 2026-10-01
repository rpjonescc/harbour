import { MICRO_PER_AUD } from "@/lib/costs/budget";
import { recordCost } from "@/lib/costs/ledger";
import type { Db } from "@/lib/db/client";
import { costs } from "@/lib/db/schema";
import { fakePaidCollector } from "@/tests/helpers/fake-paid-collector";
import { fake, ok, runsOf, scanStatus, setup, t0, texts } from "@/tests/helpers/scan-run";

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);
const budget = (capAud: number) => ({ budget: { capMicroAud: A$(capAud), timeZone: "UTC" } });

function spend(db: Db, amountMicroAud: number) {
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
    t0,
  );
}

const run = (db: Db, collector: string) => runsOf(db).find((r) => r.collector === collector);

describe("runScan budget guard", () => {
  it("with no budget skips a paid collector before it runs; free ones still run", async () => {
    const paid = fakePaidCollector({ pricePerCallMicro: 600, calls: 3 });
    const { db, scan } = setup([ok("crawler"), paid, ok("readiness")]);
    const job = await scan();
    const reason = "budget: no monthly budget set (HARBOUR_MONTHLY_BUDGET_AUD)";
    expect(run(db, "rankings")).toMatchObject({ status: "skipped", error: reason });
    expect(paid.calls).toBe(0);
    expect(texts(db, job)).toContain(`rankings: skipped — ${reason}`);
    expect(runsOf(db).map((r) => r.status)).toEqual(["ok", "skipped", "ok"]);
    expect(scanStatus(db)).toBe("ok");
  });

  it("lets the collector's own budget check stop it when the next call would not fit", async () => {
    const paid = fakePaidCollector({ pricePerCallMicro: A$(0.02), calls: 3 });
    const { db, scan } = setup([paid], budget(1));
    spend(db, A$(0.99));
    await scan();
    expect(run(db, "rankings")).toMatchObject({
      status: "skipped",
      error: "budget: monthly budget reached after 0 calls",
    });
    expect(paid.calls).toBe(0);
    expect(db.select().from(costs).all()).toHaveLength(1);
  });

  it("skips a paid collector before it runs once the budget is reached", async () => {
    const paid = fakePaidCollector({ pricePerCallMicro: 600, calls: 3 });
    const { db, scan } = setup([paid], budget(1));
    spend(db, A$(1));
    await scan();
    expect(run(db, "rankings")).toMatchObject({
      status: "skipped",
      error: "budget: A$1.00 monthly budget reached (A$1.00 spent)",
    });
    expect(paid.calls).toBe(0);
  });

  it("records every paid call with the product, collector and job", async () => {
    const paid = fakePaidCollector({ pricePerCallMicro: A$(0.01), calls: 3 });
    const { db, scan } = setup([paid], budget(1));
    const job = await scan();
    expect(run(db, "rankings")).toMatchObject({ status: "ok", items: 3 });
    const rows = db.select().from(costs).all();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        provider: "dataforseo",
        collector: "rankings",
        productId: "acme-docs",
        units: 1,
        amountMicroAud: A$(0.01),
        jobId: job.id,
      });
    }
  });

  it("fails only the collector whose cost the ledger refuses", async () => {
    const buggy = fake("rankings", async (ctx) => {
      if (ctx.budget.allow(1000)) {
        ctx.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: 0.5 });
      }
      return { status: "ok", observations: [] };
    });
    buggy.paid = true;
    const { db, scan } = setup([ok("crawler"), buggy], budget(1));
    await scan();
    expect(run(db, "rankings")?.status).toBe("failed");
    expect(run(db, "rankings")?.error).toMatch(/amountMicroAud/);
    expect(run(db, "crawler")?.status).toBe("ok");
    expect(scanStatus(db)).toBe("partial");
  });

  it("fails a collector that swallows the ledger's refusal: a cost is never silently lost", async () => {
    const swallows = fake("rankings", async (ctx) => {
      try {
        ctx.cost.record({ provider: "acme-api", units: 1, amountMicroAud: 1000 });
      } catch {
        // A collector bug: the call happened but its cost was not recorded.
      }
      return { status: "ok", observations: [] };
    });
    swallows.paid = true;
    const { db, scan } = setup([swallows], budget(1));
    await scan();
    expect(run(db, "rankings")).toMatchObject({ status: "failed" });
    expect(run(db, "rankings")?.error).toMatch(/provider/);
  });

  it("gives a free collector no way to spend", async () => {
    let allowed: boolean | undefined;
    const free = fake("crawler", async (ctx) => {
      allowed = ctx.budget.allow(1);
      expect(() =>
        ctx.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: 1 }),
      ).toThrow(/not a paid collector/);
      return { status: "ok", observations: [] };
    });
    const { db, scan } = setup([free], budget(60));
    await scan();
    expect(allowed).toBe(false);
    expect(db.select().from(costs).all()).toEqual([]);
  });
});
