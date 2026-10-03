import { type Config, parseConfig } from "@/lib/config";
import { recordCost } from "@/lib/costs/ledger-write";
import { jobs } from "@/lib/db/schema";
import type { ProductTracking } from "@/lib/products/config";
import { openTestDb } from "@/tests/helpers/db";
import { OUTSIDE_CHECK_LIMITS, requestOutsideCheck } from "./outside-check";
import { claimNextJob, finishJob } from "./queue";

const HOUR = 60 * 60_000;
const NOW = new Date("2026-10-04T06:00:00Z");
const DAY_START = Date.parse("2026-10-04T00:00:00Z");
const TRACKING: ProductTracking = {
  queries: ["acme docs"],
  questions: [],
  country: "AU",
  languageCode: "en",
};
const config = (env: Record<string, string> = {}): Config =>
  parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "https://harbour.example.ts.net",
    HARBOUR_RP_ID: "harbour.example.ts.net",
    HARBOUR_TIMEZONE: "UTC",
    HARBOUR_TREG_API_KEY: "example-key",
    HARBOUR_MONTHLY_BUDGET_AUD: "10",
    ...env,
  });

function setup(over: { config?: Config; tracking?: ProductTracking | null } = {}) {
  const db = openTestDb();
  const request = (at: Date, productId = "acme-docs") =>
    requestOutsideCheck({
      db,
      config: over.config ?? config(),
      now: at,
      login: "owner@example.com",
      productId,
      tracking: over.tracking === undefined ? TRACKING : over.tracking,
    });
  /** Runs the queued job to its end so the next request is not a duplicate. */
  const finish = (at: Date) => {
    const job = claimNextJob(db, at);
    if (job) finishJob(db, job.id, "ok", null, at);
  };
  return { db, request, finish };
}

describe("requestOutsideCheck", () => {
  it("queues one job for the product, asked for by the owner", () => {
    const { db, request } = setup();
    const result = request(NOW);
    expect(result).toMatchObject({ ok: true, created: true });
    expect(db.select().from(jobs).all()).toMatchObject([
      {
        kind: "outside-check",
        params: { productId: "acme-docs" },
        requestedBy: "owner@example.com",
      },
    ]);
  });

  it("returns the job already queued or running, with no error and no new job", () => {
    const { db, request } = setup();
    const first = request(NOW);
    const second = request(new Date(NOW.getTime() + 1_000));
    expect(second).toEqual({ ok: true, id: first.ok ? first.id : -1, created: false });
    expect(db.select().from(jobs).all()).toHaveLength(1);
  });

  it("dedupes before the limits: a click at the daily cap on an active job is not refused", () => {
    const { request, finish } = setup();
    const at = (hours: number) => new Date(DAY_START + hours * HOUR);
    for (const h of [0.5, 7, 13.5]) {
      expect(request(at(h))).toMatchObject({ ok: true, created: true });
      finish(at(h));
    }
    expect(request(at(20))).toEqual({ ok: false, reason: "daily_cap" });
    // A queued job (made some other way) is returned, not refused.
    const { db, request: again } = setup();
    for (const h of [0.5, 7]) {
      again(at(h));
      const job = claimNextJob(db, at(h));
      if (job) finishJob(db, job.id, "ok", null, at(h));
    }
    expect(again(at(13.5))).toMatchObject({ ok: true, created: true });
    expect(again(at(13.6))).toMatchObject({ ok: true, created: false });
    expect(db.select().from(jobs).all()).toHaveLength(3);
  });

  it("allows one check per 6 hours: too soon, then fine once 6 hours have passed", () => {
    const { request, finish } = setup();
    expect(request(NOW)).toMatchObject({ ok: true, created: true });
    finish(NOW);
    expect(request(new Date(NOW.getTime() + 5 * HOUR + 59 * 60_000))).toEqual({
      ok: false,
      reason: "too_soon",
    });
    expect(request(new Date(NOW.getTime() + 6 * HOUR + 1))).toMatchObject({
      ok: true,
      created: true,
    });
  });

  it("counts the 6 hours across local midnight", () => {
    const { request, finish } = setup();
    const late = new Date("2026-10-04T23:00:00Z");
    request(late);
    finish(late);
    expect(request(new Date("2026-10-05T02:00:00Z"))).toEqual({ ok: false, reason: "too_soon" });
  });

  it("allows 3 a day, then says so, and starts again the next local day", () => {
    const { request, finish } = setup();
    const at = (hours: number) => new Date(DAY_START + hours * HOUR);
    for (const h of [1, 8, 15]) {
      expect(request(at(h))).toMatchObject({ ok: true, created: true });
      finish(at(h));
    }
    expect(request(at(22))).toEqual({ ok: false, reason: "daily_cap" });
    expect(request(at(25))).toMatchObject({ ok: true, created: true });
    expect(OUTSIDE_CHECK_LIMITS).toMatchObject({ gapMs: 6 * HOUR, perDay: 3, perDayAll: 4 });
  });

  it("counts each product on its own", () => {
    const { request } = setup();
    expect(request(NOW)).toMatchObject({ created: true });
    expect(request(new Date(NOW.getTime() + HOUR), "other-product")).toMatchObject({
      created: true,
    });
  });

  it("refuses with no searches chosen, no key, and no budget, saying which", () => {
    expect(setup({ tracking: null }).request(NOW)).toEqual({ ok: false, reason: "no_searches" });
    expect(setup({ tracking: { ...TRACKING, queries: [] } }).request(NOW)).toEqual({
      ok: false,
      reason: "no_searches",
    });
    const noKey = config({ HARBOUR_TREG_API_KEY: "x" });
    expect(setup({ config: { ...noKey, HARBOUR_TREG_API_KEY: undefined } }).request(NOW)).toEqual({
      ok: false,
      reason: "key_missing",
    });
    expect(setup({ config: config({ HARBOUR_MONTHLY_BUDGET_AUD: "0" }) }).request(NOW)).toEqual({
      ok: false,
      reason: "budget_used_up",
    });
  });
});

describe("spend protection", () => {
  const spend = (
    db: ReturnType<typeof setup>["db"],
    micro: number,
    when: Date,
    collector = "treg",
  ) =>
    recordCost(
      db,
      {
        provider: "treg",
        collector,
        productId: "acme-docs",
        units: 1,
        amountMicroAud: micro,
        jobId: null,
      },
      when,
    );

  it("allows 4 checks a day across all products, then says so", () => {
    const { request, finish } = setup();
    const at = (hours: number) => new Date(DAY_START + hours * HOUR);
    for (const [h, product] of [
      [0.5, "p-one"],
      [1, "p-two"],
      [7, "p-one"],
      [7.5, "p-two"],
    ] as const) {
      expect(request(at(h), product)).toMatchObject({ ok: true, created: true });
      finish(at(h));
    }
    expect(request(at(13), "p-three")).toEqual({ ok: false, reason: "daily_cap_all" });
    // Tomorrow it starts again.
    expect(request(at(25), "p-three")).toMatchObject({ ok: true, created: true });
  });

  it("returns an active check before the all-products limit", () => {
    const { request, finish } = setup();
    const at = (hours: number) => new Date(DAY_START + hours * HOUR);
    for (const [h, product] of [
      [0.5, "p-one"],
      [1, "p-two"],
      [7, "p-one"],
    ] as const) {
      request(at(h), product);
      finish(at(h));
    }
    expect(request(at(7.5), "p-two")).toMatchObject({ ok: true, created: true });
    expect(request(at(8), "p-two")).toMatchObject({ ok: true, created: false });
    expect(request(at(9), "p-three")).toEqual({ ok: false, reason: "daily_cap_all" });
  });

  it("counts the local day, not 24 hours, across a daylight saving change", () => {
    // Sydney moves its clocks forward on 4 Oct 2026: that day runs 3 Oct 14:00 UTC to 4 Oct 13:00 UTC
    // (23 hours), and the next one starts at 13:00 UTC.
    const { request, finish } = setup({ config: config({ HARBOUR_TIMEZONE: "Australia/Sydney" }) });
    const utc = (iso: string) => new Date(iso);
    const ask = (iso: string) => {
      const result = request(utc(iso));
      finish(utc(iso));
      return result;
    };
    // Three on 3 Oct, local time: the limit for that day.
    for (const iso of ["2026-10-03T01:00:00Z", "2026-10-03T07:10:00Z", "2026-10-03T13:20:00Z"]) {
      expect(ask(iso)).toMatchObject({ ok: true, created: true });
    }
    expect(request(utc("2026-10-03T13:50:00Z"))).toEqual({ ok: false, reason: "too_soon" });
    // Yesterday's three do not count against 4 Oct, though they are inside 24 hours.
    for (const iso of ["2026-10-03T19:30:00Z", "2026-10-04T01:40:00Z", "2026-10-04T07:50:00Z"]) {
      expect(ask(iso)).toMatchObject({ ok: true, created: true });
    }
    // 13:55 UTC on the 4th is already 5 Oct locally: a new day, though the last 24 hours hold three.
    expect(ask("2026-10-04T13:55:00Z")).toMatchObject({ ok: true, created: true });
  });

  it("refuses once Treg has used 70 % of the month's budget, exactly at the edge", () => {
    // Budget A$10 is 10,000,000 micro-AUD: 70 % is 7,000,000.
    const below = setup();
    spend(below.db, 6_999_999, NOW);
    expect(below.request(NOW)).toMatchObject({ ok: true, created: true });
    const edge = setup();
    spend(edge.db, 7_000_000, NOW);
    expect(edge.request(NOW)).toEqual({ ok: false, reason: "budget_kept" });
  });

  it("counts only Treg, and only this month", () => {
    const { db, request } = setup();
    spend(db, 9_000_000, NOW, "other-collector");
    spend(db, 9_000_000, new Date("2026-09-20T00:00:00Z"));
    expect(request(NOW)).toMatchObject({ ok: true, created: true });
  });

  it("says the budget is used up before it says it is kept", () => {
    const { db, request } = setup();
    spend(db, 10_000_000, NOW);
    expect(request(NOW)).toEqual({ ok: false, reason: "budget_used_up" });
  });

  it("returns an active check even when the share is reached", () => {
    const { db, request } = setup();
    expect(request(NOW)).toMatchObject({ created: true });
    spend(db, 8_000_000, NOW);
    expect(request(new Date(NOW.getTime() + 1_000))).toMatchObject({ ok: true, created: false });
  });
});
