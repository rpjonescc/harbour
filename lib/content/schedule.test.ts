import { jobs as jobsTable } from "@/lib/db/schema";
import { enqueueJob, listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import {
  latestIdeasSlotDay,
  makeDigestSchedule,
  makeIdeasSchedule,
  nextDigestRun,
  nextIdeasRun,
} from "./schedule";

const ZONE = "Australia/Brisbane"; // UTC+10 all year: 05:45 local is 19:45 UTC the evening before

function harness(
  options: { enabled?: boolean; tokenSet?: boolean; keySet?: boolean; dailyRuns?: number } = {},
) {
  const db = openTestDb();
  let now = 0;
  const schedule = makeDigestSchedule({
    db,
    timeZone: ZONE,
    digestTime: "05:45",
    enabled: options.enabled ?? true,
    tokenSet: options.tokenSet ?? true,
    keySet: options.keySet ?? true,
    dailyRuns: options.dailyRuns ?? 24,
    clock: () => now,
  });
  return {
    db,
    at: (iso: string) => {
      now = Date.parse(iso);
      return schedule.tick();
    },
  };
}

describe("the digest schedule", () => {
  it("queues one digest for yesterday after the slot, and not again", () => {
    const h = harness();
    expect(h.at("2026-10-01T19:00:00Z")).toBeNull(); // 05:00 on 2 October: before the slot
    expect(h.at("2026-10-01T20:00:00Z")).toMatchObject({ day: "2026-10-01" }); // 06:00 local
    expect(h.at("2026-10-01T21:00:00Z")).toBeNull();
    expect(listJobs(h.db).map((j) => [j.kind, j.params])).toEqual([
      ["content-digest", { day: "2026-10-01" }],
    ]);
  });

  it("queues nothing for an earlier day on a first start before the slot", () => {
    const h = harness();
    expect(h.at("2026-10-01T19:00:00Z")).toBeNull();
    expect(listJobs(h.db)).toEqual([]);
  });

  it("does not queue the same day twice when the owner already asked for it", () => {
    const h = harness();
    enqueueJob(
      h.db,
      "content-digest",
      { day: "2026-10-01" },
      "owner@example.com",
      new Date("2026-10-01T18:00:00Z"),
    );
    expect(h.at("2026-10-01T20:00:00Z")).toBeNull();
    expect(listJobs(h.db)).toHaveLength(1);
  });

  it("does not backfill earlier days after a long outage: one digest, for the day before the latest slot", () => {
    const h = harness();
    expect(h.at("2026-10-05T03:00:00Z")).toMatchObject({ day: "2026-10-04" });
    expect(listJobs(h.db)).toHaveLength(1);
  });

  it("does not queue a second digest after a restart (a new schedule over the same database)", () => {
    const h = harness();
    expect(h.at("2026-10-01T20:00:00Z")).not.toBeNull();
    const restarted = makeDigestSchedule({
      db: h.db,
      timeZone: ZONE,
      digestTime: "05:45",
      enabled: true,
      tokenSet: true,
      keySet: true,
      dailyRuns: 24,
      clock: () => Date.parse("2026-10-01T20:05:00Z"),
    });
    expect(restarted.tick()).toBeNull();
    expect(listJobs(h.db)).toHaveLength(1);
  });

  it("does not retry a digest that failed", () => {
    const h = harness();
    h.at("2026-10-01T20:00:00Z");
    h.db.update(jobsTable).set({ status: "failed" }).run();
    expect(h.at("2026-10-01T22:00:00Z")).toBeNull();
    expect(listJobs(h.db)).toHaveLength(1);
  });

  it.each([
    ["off", { enabled: false }],
    ["without a Claude token", { tokenSet: false }],
    ["without a Screenpipe key", { keySet: false }],
  ])("queues nothing %s", (_label, options) => {
    const h = harness(options);
    expect(h.at("2026-10-01T20:00:00Z")).toBeNull();
    expect(listJobs(h.db)).toEqual([]);
  });

  it("respects the daily run cap", () => {
    expect(harness({ dailyRuns: 1 }).at("2026-10-01T20:00:00Z")).not.toBeNull();
    const h = harness({ dailyRuns: 0 });
    expect(h.at("2026-10-01T20:00:00Z")).toBeNull();
    expect(listJobs(h.db)).toEqual([]);
  });

  it("names the next run, or none when off", () => {
    const now = new Date("2026-10-01T20:00:00Z");
    expect(nextDigestRun(now, ZONE, "05:45", true)?.toISOString()).toBe("2026-10-02T19:45:00.000Z");
    expect(nextDigestRun(now, ZONE, "05:45", false)).toBeNull();
  });
});

describe("the ideas schedule", () => {
  // Brisbane is UTC+10: Monday 5 October 2026, 07:00 local is Sunday 4 October 21:00 UTC.
  const make = (
    db: ReturnType<typeof openTestDb>,
    clock: () => number,
    over: { enabled?: boolean; tokenSet?: boolean; dailyRuns?: number; ready?: string[] } = {},
  ) =>
    makeIdeasSchedule({
      db,
      timeZone: ZONE,
      enabled: over.enabled ?? true,
      tokenSet: over.tokenSet ?? true,
      dailyRuns: over.dailyRuns ?? 24,
      clock,
      productIds: () => ["acme-docs", "lighthouse-cafe"],
      isReady: (id) => (over.ready ?? ["acme-docs", "lighthouse-cafe"]).includes(id),
    });
  const harness = (over: Parameters<typeof make>[2] = {}) => {
    const db = openTestDb();
    let now = 0;
    const schedule = make(db, () => now, over);
    return {
      db,
      at: (iso: string) => {
        now = Date.parse(iso);
        return schedule.tick();
      },
    };
  };

  it("finds the latest Monday 07:00 at or before now", () => {
    expect(latestIdeasSlotDay(new Date("2026-10-04T21:00:00Z"), ZONE)).toBe("2026-10-05"); // Monday 07:00 local
    expect(latestIdeasSlotDay(new Date("2026-10-04T20:59:00Z"), ZONE)).toBe("2026-09-28"); // Monday 06:59 local
    expect(latestIdeasSlotDay(new Date("2026-10-07T05:00:00Z"), ZONE)).toBe("2026-10-05"); // Wednesday
  });

  it("queues one run per ready product once after the slot, and not again", () => {
    const h = harness();
    expect(h.at("2026-10-04T20:00:00Z")).toEqual([]);
    expect(h.at("2026-10-04T21:05:00Z")).toHaveLength(2);
    expect(h.at("2026-10-04T22:00:00Z")).toEqual([]);
    expect(
      listJobs(h.db)
        .map((j) => j.params.productId)
        .sort(),
    ).toEqual(["acme-docs", "lighthouse-cafe"]);
  });

  it("catches up once, on the latest Monday only, after the worker was down", () => {
    const h = harness({ ready: ["acme-docs"] });
    expect(h.at("2026-10-08T00:00:00Z")).toHaveLength(1);
    expect(h.at("2026-10-08T01:00:00Z")).toEqual([]);
    expect(listJobs(h.db)).toHaveLength(1);
  });

  it("does not queue a second run after a restart (a new schedule over the same database)", () => {
    const h = harness();
    expect(h.at("2026-10-04T21:05:00Z")).toHaveLength(2);
    const restarted = make(h.db, () => Date.parse("2026-10-04T21:10:00Z"));
    expect(restarted.tick()).toEqual([]);
    expect(listJobs(h.db)).toHaveLength(2);
  });

  it("counts the owner's own run since the slot, and a failed run, as that week's run", () => {
    const h = harness();
    enqueueJob(
      h.db,
      "content-ideas",
      { productId: "acme-docs" },
      "owner@example.com",
      new Date("2026-10-04T21:02:00Z"),
    );
    expect(h.at("2026-10-04T21:05:00Z").map((q) => q.productId)).toEqual(["lighthouse-cafe"]);
    h.db.update(jobsTable).set({ status: "failed" }).run();
    expect(h.at("2026-10-04T23:00:00Z")).toEqual([]);
    expect(listJobs(h.db)).toHaveLength(2);
  });

  it("still queues on Monday when the owner asked for ideas the Sunday before", () => {
    const h = harness({ ready: ["acme-docs"] });
    enqueueJob(
      h.db,
      "content-ideas",
      { productId: "acme-docs" },
      "owner@example.com",
      new Date("2026-10-04T10:00:00Z"),
    );
    h.db.update(jobsTable).set({ status: "ok" }).run();
    expect(h.at("2026-10-04T21:05:00Z")).toHaveLength(1);
  });

  it.each([
    ["off", { enabled: false }],
    ["without a Claude token", { tokenSet: false }],
    ["with no product ready", { ready: [] }],
    ["past the daily cap", { dailyRuns: 0 }],
  ])("queues nothing %s", (_label, over) => {
    const h = harness(over);
    expect(h.at("2026-10-04T21:05:00Z")).toEqual([]);
    expect(listJobs(h.db)).toEqual([]);
  });

  it("names the next Monday 07:00, or none when off", () => {
    expect(nextIdeasRun(new Date("2026-10-05T01:00:00Z"), ZONE, true)?.toISOString()).toBe(
      "2026-10-11T21:00:00.000Z",
    );
    expect(nextIdeasRun(new Date("2026-10-05T01:00:00Z"), ZONE, false)).toBeNull();
  });
});
