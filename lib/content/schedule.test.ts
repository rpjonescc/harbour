import { jobs as jobsTable } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { makeDigestSchedule, nextDigestRun } from "./schedule";

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
    expect(h.at("2026-10-01T20:00:00Z")).toMatchObject({ day: "2026-10-01" }); // 06:00 local
    expect(h.at("2026-10-01T21:00:00Z")).toBeNull();
    expect(h.at("2026-10-02T19:00:00Z")).toBeNull(); // 05:00 on 3 October: before the next slot
    expect(listJobs(h.db).map((j) => [j.kind, j.params])).toEqual([
      ["content-digest", { day: "2026-10-01" }],
    ]);
  });

  it("on a first start before the slot, queues one digest for the day before the latest slot", () => {
    const h = harness();
    expect(h.at("2026-10-01T19:00:00Z")).toMatchObject({ day: "2026-09-30" }); // 05:00 on 2 October
    expect(h.at("2026-10-01T19:30:00Z")).toBeNull();
    expect(h.at("2026-10-01T20:00:00Z")).toMatchObject({ day: "2026-10-01" }); // the 2 October slot
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

  it("does not retry a digest that failed, and a manual one since the slot counts", () => {
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
