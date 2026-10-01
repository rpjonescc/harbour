import type { Db } from "@/lib/db/client";
import { claimNextJob, finishJob, listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import {
  BACKUP_MINUTE,
  describeNextBackup,
  enqueueBackup,
  MAX_BACKUP_ATTEMPTS,
  makeBackupSchedule,
  nextBackupRun,
} from "./backup-schedule";

// London is on BST (UTC+1) in early October 2026: 03:15 local is 02:15Z.
const LONDON = "Europe/London";
const MINUTE = 60_000;

function harness(db: Db = openTestDb(), enabled = true) {
  let now = 0;
  const schedule = makeBackupSchedule({ db, timeZone: LONDON, enabled, clock: () => now });
  return {
    db,
    at: (iso: string) => {
      now = Date.parse(iso);
      return schedule.tick();
    },
    days: () =>
      listJobs(db, 100)
        .filter((j) => j.kind === "backup")
        .map((j) => j.params.day)
        .reverse(),
    /** Runs the queued backup and finishes it with `status` at `iso`. */
    finish: (status: "ok" | "failed", iso: string) => {
      const job = claimNextJob(db, new Date(iso));
      if (!job) throw new Error("nothing queued");
      finishJob(db, job.id, status, status === "failed" ? "disk full" : null, new Date(iso));
    },
  };
}

/** A db whose backup of `day` already ran. */
function backedUp(day: string, iso: string): Db {
  const db = openTestDb();
  enqueueBackup(db, day, null, new Date(iso));
  const job = claimNextJob(db, new Date(iso));
  if (!job) throw new Error("nothing queued");
  finishJob(db, job.id, "ok", null, new Date(iso));
  return db;
}

describe("backup schedule", () => {
  it("is set for 03:15 with three attempts", () => {
    expect(BACKUP_MINUTE).toBe(195);
    expect(MAX_BACKUP_ATTEMPTS).toBe(3);
  });

  it("queues nothing at 03:14 when yesterday's backup exists", () => {
    const h = harness(backedUp("2026-10-01", "2026-10-01T02:16:00Z"));
    expect(h.at("2026-10-02T02:14:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-10-01"]);
  });

  it("queues one backup for today at 03:15, and only one", () => {
    const h = harness(backedUp("2026-10-01", "2026-10-01T02:16:00Z"));
    expect(h.at("2026-10-02T02:15:00Z")).toEqual({
      jobId: expect.any(Number),
      day: "2026-10-02",
      attempt: 1,
    });
    expect(h.at("2026-10-02T02:16:00Z")).toBeNull();
    h.finish("ok", "2026-10-02T02:17:00Z");
    expect(h.at("2026-10-02T09:00:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("does not queue it again after a restart", () => {
    const h = harness();
    h.at("2026-10-02T02:15:00Z");
    const restarted = harness(h.db);
    expect(restarted.at("2026-10-02T02:20:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-10-02"]);
  });

  it("catches up once, for the latest night only, after the worker was down two nights", () => {
    const h = harness(backedUp("2026-09-30", "2026-09-30T02:16:00Z"));
    expect(h.at("2026-10-02T09:00:00Z")).toMatchObject({ day: "2026-10-02", attempt: 1 });
    expect(h.at("2026-10-02T09:01:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-09-30", "2026-10-02"]);
  });

  it("retries a failed backup after 10 minutes, then after 40, then stops", () => {
    const h = harness();
    h.at("2026-10-02T02:15:00Z");
    h.finish("failed", "2026-10-02T02:16:00Z");
    expect(h.at("2026-10-02T02:25:00Z")).toBeNull();
    expect(h.at("2026-10-02T02:26:00Z")).toMatchObject({ day: "2026-10-02", attempt: 2 });
    h.finish("failed", "2026-10-02T02:30:00Z");
    expect(h.at("2026-10-02T03:09:00Z")).toBeNull();
    expect(h.at("2026-10-02T03:10:00Z")).toMatchObject({ day: "2026-10-02", attempt: 3 });
    h.finish("failed", "2026-10-02T03:11:00Z");
    expect(h.at("2026-10-02T09:00:00Z")).toBeNull();
    expect(h.at("2026-10-03T02:14:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-10-02", "2026-10-02", "2026-10-02"]);
    // The next night starts afresh.
    expect(h.at("2026-10-03T02:15:00Z")).toMatchObject({ day: "2026-10-03", attempt: 1 });
  });

  it("leaves the night alone after the owner cancels its backup", () => {
    const h = harness();
    h.at("2026-10-02T02:15:00Z");
    const job = claimNextJob(h.db, new Date("2026-10-02T02:15:30Z"));
    if (!job) throw new Error("nothing queued");
    finishJob(h.db, job.id, "cancelled", null, new Date("2026-10-02T02:16:00Z"));
    expect(h.at("2026-10-02T09:00:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-10-02"]);
  });

  it("retries a backup that the worker's stop cancelled", () => {
    const h = harness();
    h.at("2026-10-02T02:15:00Z");
    const job = claimNextJob(h.db, new Date("2026-10-02T02:15:30Z"));
    if (!job) throw new Error("nothing queued");
    finishJob(h.db, job.id, "cancelled", "Worker stopped", new Date("2026-10-02T02:16:00Z"));
    expect(h.at("2026-10-02T02:26:00Z")).toMatchObject({ day: "2026-10-02", attempt: 2 });
  });

  it("counts a manual backup of today as today's backup", () => {
    const db = backedUp("2026-10-01", "2026-10-01T02:16:00Z");
    enqueueBackup(db, "2026-10-02", "owner@example.com", new Date("2026-10-02T01:00:00Z"));
    const h = harness(db);
    expect(h.at("2026-10-02T02:15:00Z")).toBeNull();
    expect(h.days()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("queues nothing when switched off", () => {
    const h = harness(openTestDb(), false);
    expect(h.at("2026-10-02T02:15:00Z")).toBeNull();
    expect(h.days()).toEqual([]);
  });

  it("checks at most every 30 seconds", () => {
    const h = harness();
    expect(h.at("2026-10-02T02:14:50Z")).toMatchObject({ day: "2026-10-01" });
    expect(h.at("2026-10-02T02:15:00Z")).toBeNull();
    expect(h.at("2026-10-02T02:15:20Z")).toMatchObject({ day: "2026-10-02" });
  });
});

describe("enqueueBackup", () => {
  it("queues a backup of the day, deduped while one is active", () => {
    const db = openTestDb();
    const first = enqueueBackup(db, "2026-10-02", null);
    expect(first.created).toBe(true);
    expect(enqueueBackup(db, "2026-10-02", null)).toEqual({ id: first.id, created: false });
  });

  it("refuses a malformed day", () => {
    expect(() => enqueueBackup(openTestDb(), "2026-10-2", null)).toThrow();
  });
});

describe("nextBackupRun", () => {
  it("is the next 03:15 local, or null when off", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(nextBackupRun(now, LONDON, true)).toEqual(new Date("2026-10-03T02:15:00Z"));
    expect(nextBackupRun(now, LONDON, false)).toBeNull();
  });

  it("is tomorrow from the slot itself, today just before it", () => {
    expect(nextBackupRun(new Date("2026-10-02T02:15:00Z"), LONDON, true)).toEqual(
      new Date(Date.parse("2026-10-03T02:15:00Z")),
    );
    expect(nextBackupRun(new Date("2026-10-02T02:14:00Z"), LONDON, true)).toEqual(
      new Date(Date.parse("2026-10-02T02:14:00Z") + MINUTE),
    );
  });
});

describe("describeNextBackup", () => {
  it("names the next local slot, or says the backup is off", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(describeNextBackup(now, LONDON, true)).toBe(
      "next backup 2026-10-03 03:15 Europe/London",
    );
    expect(describeNextBackup(now, LONDON, false)).toBe("nightly backup off");
  });
});
