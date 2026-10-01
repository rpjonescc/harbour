import { parseConfig } from "@/lib/config";
import { openTestDb } from "@/tests/helpers/db";
import { MICRO_PER_AUD } from "./budget";
import { recordCost, reserveCost } from "./ledger-write";
import { costMeterView } from "./meter-view";
import type { PaidSource } from "./paid-sources";

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);
const NOW = new Date("2026-10-16T00:00:00Z");

// A source as it will look once its collector exists: connected when its key is present.
const RANKINGS: PaidSource = {
  id: "dataforseo",
  label: "DataForSEO",
  provides: "Rankings",
  settings: ["HARBOUR_DATAFORSEO_LOGIN", "HARBOUR_DATAFORSEO_PASSWORD"],
  collector: "rankings",
};

function config(budget: string, keys = true) {
  return parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "https://harbour.example.com",
    HARBOUR_RP_ID: "harbour.example.com",
    HARBOUR_TIMEZONE: "UTC",
    HARBOUR_MONTHLY_BUDGET_AUD: budget,
    ...(keys && {
      HARBOUR_DATAFORSEO_LOGIN: "owner@example.com",
      HARBOUR_DATAFORSEO_PASSWORD: "example-password",
    }),
  });
}

function dbWithSpend(...amounts: number[]) {
  const db = openTestDb();
  for (const amountMicroAud of amounts) {
    recordCost(
      db,
      {
        provider: "dataforseo",
        collector: "rankings",
        productId: "acme-docs",
        units: 1,
        amountMicroAud,
        jobId: null,
      },
      NOW,
    );
  }
  return db;
}

describe("costMeterView", () => {
  it("has no paid sources connected in this phase, with the month's spend", () => {
    expect(costMeterView(dbWithSpend(), config("60"), NOW)).toEqual({
      state: "no-paid-sources",
      spentMicro: 0,
      unconfirmedMicro: 0,
    });
    expect(costMeterView(dbWithSpend(A$(1.23)), config("60"), NOW)).toEqual({
      state: "no-paid-sources",
      spentMicro: A$(1.23),
      unconfirmedMicro: 0,
    });
  });

  it("is no-paid-sources when a source's collector exists but its keys are missing", () => {
    const view = costMeterView(dbWithSpend(), config("60", false), NOW, [RANKINGS]);
    expect(view.state).toBe("no-paid-sources");
  });

  it("says paid calls are off when a source is connected but no budget is set", () => {
    expect(costMeterView(dbWithSpend(), config("0"), NOW, [RANKINGS])).toEqual({
      state: "no-budget",
      spentMicro: 0,
      unconfirmedMicro: 0,
    });
  });

  it("is ok under 80 %, with a projection once a day has passed", () => {
    // 15 of 31 days elapsed.
    expect(costMeterView(dbWithSpend(A$(15)), config("60"), NOW, [RANKINGS])).toEqual({
      state: "ok",
      spentMicro: A$(15),
      capMicro: A$(60),
      projectedMicro: A$(31),
      unconfirmedMicro: 0,
    });
  });

  it("warns from 80 % and says reached from 100 %", () => {
    const warn = costMeterView(dbWithSpend(A$(48)), config("60"), NOW, [RANKINGS]);
    expect(warn.state).toBe("warn");
    const reached = costMeterView(dbWithSpend(A$(60), 1), config("60"), NOW, [RANKINGS]);
    expect(reached).toMatchObject({ state: "reached", spentMicro: A$(60) + 1 });
  });

  it("has no projection on the first day of the month", () => {
    const first = new Date("2026-10-01T12:00:00Z");
    const view = costMeterView(dbWithSpend(), config("60"), first, [RANKINGS]);
    expect(view).toMatchObject({ state: "ok", projectedMicro: null });
  });

  it("counts reserved rows as spend and shows them as unconfirmed", () => {
    const db = dbWithSpend(A$(10));
    const window = {
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-11-01T00:00:00Z"),
    };
    reserveCost(
      db,
      {
        collector: "rankings",
        productId: null,
        jobId: null,
        amountMicroAud: A$(0.5),
        capMicroAud: A$(60),
        window,
      },
      NOW,
    );
    expect(costMeterView(db, config("60"), NOW, [RANKINGS])).toMatchObject({
      spentMicro: A$(10.5),
      unconfirmedMicro: A$(0.5),
    });
  });
});
