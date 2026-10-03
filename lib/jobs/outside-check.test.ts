import { type Config, parseConfig } from "@/lib/config";
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
    expect(OUTSIDE_CHECK_LIMITS).toEqual({ gapMs: 6 * HOUR, perDay: 3 });
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
