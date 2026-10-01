import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type Config, parseConfig } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { addEvent, enqueueJob, type JobStatus } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { backupStatus } from "./backup-status";

// London is on BST (UTC+1) in early October 2026: 03:15 local is 02:15Z.
const NOW = new Date("2026-10-02T09:00:00Z");
const HOUR = 60 * 60_000;
let dir: string;
let db: Db;

const config = (env: Record<string, string> = {}): Config =>
  parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "https://harbour.example.ts.net",
    HARBOUR_RP_ID: "harbour.example.ts.net",
    HARBOUR_TIMEZONE: "Europe/London",
    HARBOUR_BACKUP_DIR: dir,
    ...env,
  });

/** Moves a job straight to a terminal state (the worker's claim is not under test here). */
function finishJob(_db: Db, id: number, status: JobStatus, error: string | null, at: Date) {
  db.update(jobs).set({ status, error, finishedAt: at }).where(eq(jobs.id, id)).run();
}

/** A backup file for `day`, last modified `hoursAgo` before NOW. */
function file(day: string, hoursAgo: number, name = `harbour-${day}.db`) {
  const path = join(dir, name);
  writeFileSync(path, "x".repeat(1000));
  const at = new Date(NOW.getTime() - hoursAgo * HOUR);
  utimesSync(path, at, at);
}

/** A finished backup job of `day`, created `hoursAgo` before NOW. */
function backupJob(
  day: string,
  status: JobStatus,
  hoursAgo: number,
  opts: { by?: string | null; error?: string | null } = {},
) {
  const at = new Date(NOW.getTime() - hoursAgo * HOUR);
  const { id } = enqueueJob(db, "backup", { day }, opts.by ?? null, at);
  if (status !== "queued") {
    finishJob(db, id, status, opts.error ?? (status === "failed" ? "disk full" : null), at);
  }
  return id;
}

/** Makes the install look `hoursOld` old (its oldest job row). */
function installedHoursAgo(hoursOld: number) {
  enqueueJob(
    db,
    "scan",
    { productId: "acme-docs" },
    null,
    new Date(NOW.getTime() - hoursOld * HOUR),
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-backup-status-"));
  db = openTestDb();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("backupStatus", () => {
  it("is ok with a recent backup, counting only files that match the pattern", () => {
    file("2026-10-01", 30);
    file("2026-10-02", 6);
    file("x", 1, "notes.txt");
    file("x", 1, "harbour-2026-10-03.db.partial");
    const status = backupStatus(db, config(), NOW);
    expect(status.health).toBe("ok");
    expect(status.count).toBe(2);
    expect(status.latest).toMatchObject({ day: "2026-10-02", bytes: 1000 });
    expect(status.enabled).toBe(true);
    expect(status.next).toEqual(new Date("2026-10-03T02:15:00Z"));
    expect(status.lastFailure).toBeNull();
  });

  it("is none-yet on a young install with no backup", () => {
    installedHoursAgo(5);
    const status = backupStatus(db, config(), NOW);
    expect(status).toMatchObject({ health: "none-yet", latest: null, count: 0 });
  });

  it("is stale when the newest backup is older than 48 hours", () => {
    file("2026-09-29", 49);
    expect(backupStatus(db, config(), NOW).health).toBe("stale");
  });

  it("is stale with no backup once Harbour has run for more than 48 hours", () => {
    installedHoursAgo(49);
    expect(backupStatus(db, config(), NOW).health).toBe("stale");
  });

  it("is failed when the last scheduled attempt failed with no retry left", () => {
    file("2026-10-01", 30);
    backupJob("2026-10-02", "failed", 7);
    backupJob("2026-10-02", "failed", 6.8);
    const last = backupJob("2026-10-02", "failed", 6, { error: "disk full" });
    const status = backupStatus(db, config(), NOW);
    expect(status.health).toBe("failed");
    expect(status.lastFailure).toMatchObject({ jobId: last, error: "disk full", attemptsLeft: 0 });
  });

  it("is not failed while a retry is still due", () => {
    file("2026-10-01", 30);
    backupJob("2026-10-02", "failed", 6);
    const status = backupStatus(db, config(), NOW);
    expect(status.health).toBe("ok");
    expect(status.lastFailure).toMatchObject({ attemptsLeft: 2 });
  });

  it("is not failed while a later attempt is queued", () => {
    file("2026-10-01", 30);
    backupJob("2026-10-02", "failed", 6);
    backupJob("2026-10-02", "queued", 5);
    const status = backupStatus(db, config(), NOW);
    expect(status.lastFailure).toBeNull();
    expect(status.health).toBe("ok");
  });

  it("counts a failed manual backup as failed: nothing retries it", () => {
    file("2026-10-02", 6);
    backupJob("2026-10-02", "ok", 6);
    backupJob("2026-10-02", "failed", 1, { by: "owner@example.com", error: "disk full" });
    const status = backupStatus(db, config(), NOW);
    expect(status.health).toBe("failed");
    expect(status.lastFailure?.attemptsLeft).toBe(0);
  });

  it("clears the failure once a backup succeeds after it", () => {
    file("2026-10-02", 1);
    backupJob("2026-10-02", "failed", 6);
    backupJob("2026-10-02", "failed", 5);
    backupJob("2026-10-02", "failed", 4);
    backupJob("2026-10-02", "ok", 1, { by: "owner@example.com" });
    expect(backupStatus(db, config(), NOW)).toMatchObject({ health: "ok", lastFailure: null });
  });

  it("is off when scheduled backups are off and nothing failed", () => {
    installedHoursAgo(100);
    const status = backupStatus(db, config({ HARBOUR_SCHEDULED_BACKUP: "off" }), NOW);
    expect(status).toMatchObject({ health: "off", enabled: false, next: null });
  });

  it("still reports a failed manual backup when the schedule is off", () => {
    backupJob("2026-10-02", "failed", 1, { by: "owner@example.com" });
    const status = backupStatus(db, config({ HARBOUR_SCHEDULED_BACKUP: "off" }), NOW);
    expect(status.health).toBe("failed");
  });

  it("summarises the latest retention run", () => {
    const { id } = enqueueJob(db, "retention", { day: "2026-10-02" }, null, NOW);
    addEvent(db, id, "status", "Acme Docs: 11 scans to prune", NOW);
    addEvent(db, id, "status", "Removed 18,240 observations from 11 scans", NOW);
    finishJob(db, id, "ok", null, NOW);
    expect(backupStatus(db, config(), NOW).lastRetention).toMatchObject({
      jobId: id,
      status: "ok",
      summary: "Removed 18,240 observations from 11 scans",
    });
  });

  it("gives a failed retention run's error as its summary", () => {
    const { id } = enqueueJob(db, "retention", { day: "2026-10-02" }, null, NOW);
    finishJob(db, id, "failed", "database is locked", NOW);
    expect(backupStatus(db, config(), NOW).lastRetention).toMatchObject({
      status: "failed",
      summary: "database is locked",
    });
  });

  it("has no retention result before the first one", () => {
    expect(db.select().from(jobs).all()).toEqual([]);
    expect(backupStatus(db, config(), NOW).lastRetention).toBeNull();
  });
});
