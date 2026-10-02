import type { Db } from "@/lib/db/client";
import { claimNextJob, finishJob, listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { requestFreshNote } from "./queue";
import { makeNoteSchedule, nextNoteRun, noteEnabled } from "./schedule";

// Brisbane is UTC+10 all year: 06:30 local is 20:30 UTC the evening before.
const ZONE = "Australia/Brisbane";

function harness(
  options: { db?: Db; enabled?: boolean; tokenSet?: boolean; noteTime?: string } = {},
) {
  const db = options.db ?? openTestDb();
  let now = 0;
  const schedule = makeNoteSchedule({
    db,
    timeZone: ZONE,
    noteTime: options.noteTime ?? "06:30",
    enabled: options.enabled ?? true,
    tokenSet: options.tokenSet ?? true,
    clock: () => now,
  });
  return {
    db,
    at: (iso: string) => {
      now = Date.parse(iso);
      return schedule.tick();
    },
    stamps: () =>
      listJobs(db, 100)
        .map((j) => j.params.stamp)
        .reverse(),
    settle: (status: "ok" | "failed" = "ok") => {
      for (let job = claimNextJob(db); job; job = claimNextJob(db))
        finishJob(db, job.id, status, null);
    },
  };
}

describe("daily note schedule", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("queues one note at 06:30 local for that day, and only one", () => {
    const h = harness();
    expect(h.at("2026-10-01T20:30:00Z")).toEqual({
      jobId: expect.any(Number),
      stamp: "2026-10-02-0630",
    });
    expect(h.at("2026-10-01T20:31:00Z")).toBeNull();
    h.settle();
    expect(h.at("2026-10-02T03:00:00Z")).toBeNull();
    expect(h.at("2026-10-02T20:30:00Z")).toEqual({
      jobId: expect.any(Number),
      stamp: "2026-10-03-0630",
    });
    expect(h.stamps()).toEqual(["2026-10-02-0630", "2026-10-03-0630"]);
  });

  it("catches up once after the worker was down at the slot (restart at 21:00 local)", () => {
    const h = harness();
    expect(h.at("2026-10-02T11:00:00Z")).toEqual({
      jobId: expect.any(Number),
      stamp: "2026-10-02-0630",
    });
    expect(h.at("2026-10-02T11:01:00Z")).toBeNull();
  });

  it("derives everything from the jobs table: a restarted worker queues nothing twice", () => {
    const first = harness();
    first.at("2026-10-01T20:30:00Z");
    const restarted = harness({ db: first.db });
    expect(restarted.at("2026-10-01T20:40:00Z")).toBeNull();
    expect(first.stamps()).toHaveLength(1);
  });

  it("does not queue the scheduled note when the owner asked for one after the slot", () => {
    const h = harness();
    requestFreshNote(h.db, {
      timeZone: ZONE,
      login: "owner@example.com",
      now: new Date("2026-10-01T22:00:00Z"),
    });
    h.settle();
    expect(h.at("2026-10-01T22:05:00Z")).toBeNull();
  });

  it("does not retry a failed run in a loop: the owner can ask for another", () => {
    const h = harness();
    h.at("2026-10-01T20:30:00Z");
    h.settle("failed");
    expect(h.at("2026-10-01T21:30:00Z")).toBeNull();
    expect(h.at("2026-10-02T05:00:00Z")).toBeNull();
    expect(h.stamps()).toHaveLength(1);
  });

  it("checks at most every 30 seconds", () => {
    const h = harness();
    // 10 s before the slot: the latest slot is still yesterday's, so that catch-up is queued.
    expect(h.at("2026-10-01T20:29:50Z")).toMatchObject({ stamp: "2026-10-01-0630" });
    h.settle();
    // The slot is due 10 s later, but the gate stays shut until 30 s have passed.
    expect(h.at("2026-10-01T20:30:00Z")).toBeNull();
    expect(h.at("2026-10-01T20:30:25Z")).toMatchObject({ stamp: "2026-10-02-0630" });
  });

  it("follows HARBOUR_NOTE_TIME", () => {
    const h = harness({ noteTime: "07:15" });
    expect(h.at("2026-10-01T21:15:00Z")).toEqual({
      jobId: expect.any(Number),
      stamp: "2026-10-02-0715",
    });
  });

  it("queues nothing when off, and says once that a missing token blocks it", () => {
    expect(harness({ enabled: false }).at("2026-10-01T20:30:00Z")).toBeNull();
    const h = harness({ tokenSet: false });
    expect(h.at("2026-10-01T20:30:00Z")).toBeNull();
    expect(h.at("2026-10-01T21:30:00Z")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(h.stamps()).toEqual([]);
  });
});

describe("noteEnabled and nextNoteRun", () => {
  it("is on only for the warm personality with the schedule on", () => {
    expect(noteEnabled({ HARBOUR_PERSONALITY: "warm", HARBOUR_SCHEDULED_NOTE: "on" })).toBe(true);
    expect(noteEnabled({ HARBOUR_PERSONALITY: "quiet", HARBOUR_SCHEDULED_NOTE: "on" })).toBe(false);
    expect(noteEnabled({ HARBOUR_PERSONALITY: "warm", HARBOUR_SCHEDULED_NOTE: "off" })).toBe(false);
  });

  it("names the next 06:30, or null when off", () => {
    const now = new Date("2026-10-02T09:00:00Z");
    expect(nextNoteRun(now, "Europe/London", "06:30", true)?.toISOString()).toBe(
      "2026-10-03T05:30:00.000Z",
    );
    expect(nextNoteRun(now, "Europe/London", "06:30", false)).toBeNull();
  });
});
