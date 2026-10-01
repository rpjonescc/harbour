import type { Db } from "@/lib/db/client";
import { claimNextJob, finishJob, listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { enqueueWeeklyAnalyst, makeAnalystSchedule, nextWeeklyRun } from "./schedule";

// Sunday 4 October 2026 is in ISO week 40. Brisbane is UTC+10 all year; Sydney moves from
// UTC+10 to UTC+11 at 02:00 that morning.
const BRISBANE = "Australia/Brisbane";
const SYDNEY = "Australia/Sydney";
const PRODUCTS = ["acme-docs", "acme-blog"];

type Options = { db?: Db; timeZone?: string; enabled?: boolean; tokenSet?: boolean };

function harness(options: Options = {}) {
  const db = options.db ?? openTestDb();
  let now = 0;
  const schedule = makeAnalystSchedule({
    db,
    timeZone: options.timeZone ?? BRISBANE,
    enabled: options.enabled ?? true,
    tokenSet: options.tokenSet ?? true,
    clock: () => now,
    productIds: () => PRODUCTS,
  });
  return {
    db,
    at: (iso: string) => {
      now = Date.parse(iso);
      return schedule.tick();
    },
    weeks: () =>
      listJobs(db, 100)
        .filter((j) => j.kind === "weekly-analyst")
        .map((j) => j.params.week)
        .reverse(),
    /** Runs every queued job to completion, so enqueue dedupe no longer hides a new one. */
    settleAll: () => {
      for (let job = claimNextJob(db); job; job = claimNextJob(db)) {
        finishJob(db, job.id, "ok", null);
      }
    },
  };
}

/** A scored scan of acme-docs, so the week has something to report on. */
const scanned = (db: Db, iso: string) =>
  seedScan(db, { productId: "acme-docs", at: new Date(iso) });

describe("weekly analyst schedule", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("queues one run at Sunday 20:00 local for that week, and only one (Brisbane)", () => {
    const h = harness();
    scanned(h.db, "2026-09-26T20:00:00Z");
    expect(h.at("2026-09-27T10:00:00Z")).toEqual({ jobId: expect.any(Number), week: "2026-W39" });
    h.settleAll();
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-03T10:00:00Z")).toBeNull(); // Saturday: last Sunday's run is done
    expect(h.at("2026-10-04T09:59:00Z")).toBeNull(); // Sunday 19:59
    expect(h.at("2026-10-04T10:00:00Z")).toEqual({ jobId: expect.any(Number), week: "2026-W40" });
    h.settleAll();
    expect(h.at("2026-10-04T10:01:00Z")).toBeNull(); // second tick
    expect(h.weeks()).toEqual(["2026-W39", "2026-W40"]);
  });

  it("keeps Sunday 20:00 local on the day Sydney changes to daylight time", () => {
    const h = harness({ timeZone: SYDNEY });
    enqueueWeeklyAnalyst(h.db, "2026-W39", null, new Date("2026-09-27T10:00:00Z"));
    h.settleAll();
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-04T08:59:00Z")).toBeNull(); // 19:59 AEDT
    expect(h.at("2026-10-04T09:00:00Z")).toMatchObject({ week: "2026-W40" }); // 20:00 AEDT
    expect(h.weeks()).toEqual(["2026-W39", "2026-W40"]);
  });

  it("does not queue again after a restart", () => {
    const db = openTestDb();
    scanned(db, "2026-10-02T20:00:00Z");
    const first = harness({ db });
    expect(first.at("2026-10-04T10:00:00Z")).toMatchObject({ week: "2026-W40" });
    first.settleAll();
    const restarted = harness({ db });
    expect(restarted.at("2026-10-04T11:00:00Z")).toBeNull();
    expect(restarted.weeks()).toEqual(["2026-W40"]);
  });

  it("catches up once on start when the worker was down from Sunday to Wednesday", () => {
    const h = harness();
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-07T02:00:00Z")).toMatchObject({ week: "2026-W40" }); // Wednesday
    h.settleAll();
    expect(h.at("2026-10-07T03:00:00Z")).toBeNull();
    expect(h.weeks()).toEqual(["2026-W40"]);
  });

  it("still runs Sunday's report after a manual run earlier in the week", () => {
    const h = harness();
    enqueueWeeklyAnalyst(h.db, "2026-W39", null, new Date("2026-09-27T10:00:00Z"));
    enqueueWeeklyAnalyst(h.db, "2026-W40", "owner", new Date("2026-09-30T02:00:00Z")); // Wed
    h.settleAll();
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-04T10:00:00Z")).toMatchObject({ week: "2026-W40" });
    expect(h.weeks()).toEqual(["2026-W39", "2026-W40", "2026-W40"]);
  });

  it("counts a manual run after Sunday 20:00 as that week's run", () => {
    const h = harness();
    scanned(h.db, "2026-10-02T20:00:00Z");
    enqueueWeeklyAnalyst(h.db, "2026-W40", "owner", new Date("2026-10-04T11:00:00Z")); // 21:00
    h.settleAll();
    expect(h.at("2026-10-04T11:30:00Z")).toBeNull();
    expect(h.weeks()).toEqual(["2026-W40"]);
  });

  it("checks at most every 30 seconds", () => {
    const h = harness();
    enqueueWeeklyAnalyst(h.db, "2026-W39", null, new Date("2026-09-27T10:00:00Z"));
    h.settleAll();
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-04T09:59:50Z")).toBeNull();
    expect(h.at("2026-10-04T10:00:10Z")).toBeNull(); // 20 s later: not checked
    expect(h.at("2026-10-04T10:00:20Z")).toMatchObject({ week: "2026-W40" });
  });

  it("queues nothing when scheduled runs are off", () => {
    const h = harness({ enabled: false });
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-04T10:00:00Z")).toBeNull();
    expect(h.weeks()).toEqual([]);
  });

  it("queues nothing without a Claude token, saying so once", () => {
    const h = harness({ tokenSet: false });
    scanned(h.db, "2026-10-02T20:00:00Z");
    expect(h.at("2026-10-04T10:00:00Z")).toBeNull();
    expect(h.at("2026-10-04T10:01:00Z")).toBeNull();
    expect(h.weeks()).toEqual([]);
    expect(log.mock.calls).toEqual([["weekly analyst skipped: no Claude token"]]);
  });

  it("queues nothing when no product has a scored scan in the last 7 days", () => {
    const h = harness();
    scanned(h.db, "2026-09-27T09:00:00Z"); // over 7 days before the check
    seedScan(h.db, { productId: "acme-shop", at: new Date("2026-10-02T20:00:00Z") }); // not configured
    seedScan(h.db, { productId: "acme-blog", at: new Date("2026-10-02T20:00:00Z"), scored: false });
    expect(h.at("2026-10-04T10:00:00Z")).toBeNull();
    expect(h.at("2026-10-04T10:01:00Z")).toBeNull();
    expect(h.weeks()).toEqual([]);
    expect(log.mock.calls).toEqual([["weekly analyst skipped: no scan data this week"]]);
  });
});

describe("enqueueWeeklyAnalyst", () => {
  it("dedupes by week while a run is queued", () => {
    const db = openTestDb();
    const first = enqueueWeeklyAnalyst(db, "2026-W40", "owner");
    expect(enqueueWeeklyAnalyst(db, "2026-W40", null)).toEqual({ id: first.id, created: false });
    expect(enqueueWeeklyAnalyst(db, "2026-W41", null).created).toBe(true);
    expect(listJobs(db).map((j) => j.params)).toEqual([{ week: "2026-W41" }, { week: "2026-W40" }]);
  });

  it("rejects a malformed week", () => {
    const db = openTestDb();
    expect(() => enqueueWeeklyAnalyst(db, "2026-40", null)).toThrow("Invalid ISO week: 2026-40");
    expect(listJobs(db)).toEqual([]);
  });
});

describe("nextWeeklyRun", () => {
  it("is the next Sunday 20:00 local", () => {
    expect(nextWeeklyRun(new Date("2026-10-04T08:59:00Z"), SYDNEY, true)).toEqual(
      new Date("2026-10-04T09:00:00Z"),
    );
    expect(nextWeeklyRun(new Date("2026-10-04T10:00:00Z"), BRISBANE, true)).toEqual(
      new Date("2026-10-11T10:00:00Z"),
    );
  });

  it("is null when scheduled runs are off", () => {
    expect(nextWeeklyRun(new Date("2026-10-04T08:59:00Z"), SYDNEY, false)).toBeNull();
  });
});
