import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { connectionOf } from "@/lib/db/client";
import {
  claimNextJob,
  enqueueJob,
  eventsSince,
  getJob,
  type Job,
  listJobs,
  requestCancel,
} from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { addScans, scansWithObservations } from "@/tests/helpers/retention";
import { describeBackup, type OpsJobDeps, runBackupJob, runRetentionJob } from "./backup-job";
import { enqueueBackup } from "./backup-schedule";

const fsState = vi.hoisted(() => ({ failUnlink: false }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    unlinkSync: (path: string) => {
      if (fsState.failUnlink) throw new Error("EACCES: permission denied, unlink");
      actual.unlinkSync(path);
    },
  };
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-backup-job-"));
});
afterEach(() => {
  fsState.failUnlink = false;
  rmSync(dir, { recursive: true, force: true });
});

function setup(
  day = "2026-10-02",
  backupDir = join(dir, "backups"),
): { deps: OpsJobDeps; db: Db; job: Job } {
  const db = openTestDb();
  const config = parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "http://localhost:3400",
    HARBOUR_RP_ID: "localhost",
    HARBOUR_BACKUP_DIR: backupDir,
  });
  enqueueBackup(db, day, null);
  const job = claimNextJob(db);
  if (!job) throw new Error("no job claimed");
  const deps: OpsJobDeps = {
    db,
    config,
    productIds: () => ["acme-docs"],
    now: () => new Date("2026-10-02T02:15:00Z"),
    stopping: () => false,
  };
  return { deps, db, job };
}

const texts = (db: Db, jobId: number) => eventsSince(db, jobId, 0).map((e) => [e.kind, e.text]);
const queuedRetention = (db: Db) =>
  listJobs(db)
    .filter((j) => j.kind === "retention")
    .map((j) => [j.status, j.params, j.requestedBy]);

describe("runBackupJob", () => {
  it("backs up, reports what it verified and finishes ok", async () => {
    const { deps, db, job } = setup();
    await runBackupJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "ok", error: null });
    const events = texts(db, job.id);
    expect(events[0]).toEqual(["status", "Backing up to harbour-2026-10-02.db"]);
    expect(events[1]?.[0]).toBe("status");
    expect(events[1]?.[1]).toMatch(
      /^Backup verified: \d+\.\d MB, [\d,]+ pages in \d+\.\d s; 1 kept$/,
    );
    expect(queuedRetention(db)).toEqual([["queued", { day: "2026-10-02" }, null]]);
  });

  it("fails the job with the reason and records it", async () => {
    const { deps, db, job } = setup();
    const bad = { ...job, params: { day: "not-a-day" } };
    await runBackupJob(deps, bad);
    const row = getJob(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/Invalid date/);
    expect(texts(db, job.id).at(-1)).toEqual(["error", row?.error]);
    expect(queuedRetention(db)).toEqual([]);
  });
});

describe("runBackupJob when the backup cannot finish", () => {
  it("fails the job when the backup itself fails", async () => {
    writeFileSync(join(dir, "a-file"), "not a folder");
    const { deps, db, job } = setup("2026-10-02", join(dir, "a-file", "backups"));
    await runBackupJob(deps, job);
    const row = getJob(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/ENOTDIR/);
    expect(texts(db, job.id)).toEqual([
      ["status", "Backing up to harbour-2026-10-02.db"],
      ["error", row?.error],
    ]);
  });

  it("finishes cancelled, with no partial left, when the owner cancels it", async () => {
    const { deps, db, job } = setup();
    expect(requestCancel(db, job.id)).toBe("requested");
    await runBackupJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "cancelled", error: null });
    expect(texts(db, job.id).at(-1)).toEqual(["status", "Cancelled"]);
    expect(readdirSync(join(dir, "backups"))).toEqual([]);
  });

  it("finishes cancelled as stopped by the worker, with no partial left", async () => {
    const { deps, db, job } = setup();
    await runBackupJob({ ...deps, stopping: () => true }, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "cancelled", error: "Worker stopped" });
    expect(readdirSync(join(dir, "backups"))).toEqual([]);
  });

  it("stays ok but records an error when pruning fails after the backup was kept", async () => {
    const { deps, db, job } = setup();
    const backups = join(dir, "backups");
    await runBackupJob(deps, job); // creates the folder
    for (let d = 1; d <= 14; d++) {
      writeFileSync(join(backups, `harbour-2026-09-${String(d).padStart(2, "0")}.db`), "old");
    }
    const { deps: deps2, db: db2, job: job2 } = setup("2026-10-03");
    fsState.failUnlink = true;
    await runBackupJob(deps2, job2);
    expect(getJob(db2, job2.id)).toMatchObject({ status: "ok", error: null });
    const events = texts(db2, job2.id);
    expect(
      events.some(([kind, text]) => kind === "status" && text?.startsWith("Backup verified")),
    ).toBe(true);
    expect(events.at(-1)).toEqual([
      "error",
      "Could not remove old backups: EACCES: permission denied, unlink",
    ]);
    expect(getJob(db, job.id)?.status).toBe("ok");
  });
});

describe("runRetentionJob", () => {
  function retention(over: Partial<OpsJobDeps> = {}) {
    const { deps, db } = setup();
    addScans(db, "acme-docs", 41, { pages: 1000 });
    enqueueJob(db, "retention", { day: "2026-10-02" }, null);
    const job = claimNextJob(db);
    if (!job) throw new Error("no job claimed");
    return { deps: { ...deps, ...over }, db, job };
  }

  it("prunes old observations and says how many, per product", async () => {
    const { deps, db, job } = retention();
    await runRetentionJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "ok", error: null });
    expect(texts(db, job.id)).toEqual([
      ["status", "acme-docs: 11 old scans, 11,000 observations"],
      ["status", "Removed 11,000 observations from 11 scans"],
    ]);
    expect(scansWithObservations(db)[0]).toBe(12);
  });

  it("says when there is nothing to prune", async () => {
    const { deps, db, job } = retention();
    await runRetentionJob(deps, job);
    enqueueJob(db, "retention", { day: "2026-10-03" }, null);
    const again = claimNextJob(db);
    if (!again) throw new Error("no job claimed");
    await runRetentionJob(deps, again);
    expect(texts(db, again.id)).toEqual([
      ["status", "Nothing to prune — every product has at most 30 scans with observations"],
    ]);
  });

  it("fails the job with the reason, and leaves the rest for the next night", async () => {
    const { deps, db, job } = retention();
    connectionOf(db).exec("DROP TABLE observations");
    await runRetentionJob(deps, job);
    const row = getJob(db, job.id);
    expect(row).toMatchObject({ status: "failed", error: expect.stringMatching(/observations/) });
    expect(texts(db, job.id).at(-1)).toEqual(["error", row?.error]);
  });

  it("finishes cancelled when the worker stops", async () => {
    const { deps, db, job } = retention({ stopping: () => true });
    await runRetentionJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "cancelled", error: "Worker stopped" });
    expect(texts(db, job.id).at(-1)).toEqual(["status", "Worker stopped"]);
    expect(scansWithObservations(db)[0]).toBe(1);
  });
});

describe("describeBackup", () => {
  it("says what was verified, kept and removed", () => {
    expect(
      describeBackup({
        name: "harbour-2026-10-02.db",
        bytes: 12_400_000,
        pages: 3021,
        ms: 2100,
        kept: 14,
        pruned: ["harbour-2026-09-18.db"],
        pruneError: null,
      }),
    ).toBe(
      "Backup verified: 12.4 MB, 3,021 pages in 2.1 s; 14 kept, 1 removed (harbour-2026-09-18.db)",
    );
  });
});
