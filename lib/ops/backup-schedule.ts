import type { Db } from "@/lib/db/client";
import { latestDailySlotDay, localTime, nextDailySlot } from "@/lib/format/zoned-time";
import { enqueueJob, type Job, jobsCreatedSince } from "@/lib/jobs/queue";
import { makeThrottle } from "@/lib/jobs/throttle";
import { backupFileName } from "./backup-files";

/** The nightly backup is due from 03:15 local time. */
export const BACKUP_MINUTE = 3 * 60 + 15;
export const MAX_BACKUP_ATTEMPTS = 3;
/** Wait after the 1st and 2nd failed attempt before the next one. */
const BACKOFF_MS = [10 * 60_000, 40 * 60_000];
const CHECK_MS = 30_000;
/** A slot day's attempts are all created within a day or so of it. */
const LOOKBACK_MS = 3 * 24 * 60 * 60_000;

/** Queues a backup of local `day` unless one is already queued or running. */
export function enqueueBackup(
  db: Db,
  day: string,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  backupFileName(day); // throws unless `day` is YYYY-MM-DD
  return enqueueJob(db, "backup", { day }, requestedBy, now);
}

/** When the schedule next queues a backup (03:15 local), or null when it is off. */
export function nextBackupRun(now: Date, timeZone: string, enabled: boolean): Date | null {
  return enabled ? nextDailySlot(now, timeZone, BACKUP_MINUTE) : null;
}

/** For the worker's ready line: "next backup 2026-10-03 03:15 Europe/London" or "nightly backup off". */
export function describeNextBackup(now: Date, timeZone: string, enabled: boolean): string {
  const next = nextBackupRun(now, timeZone, enabled);
  if (!next) return "nightly backup off";
  const local = localTime(timeZone, next);
  const hhmm = [Math.floor(local.minute / 60), local.minute % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return `next backup ${local.day} ${hhmm} ${timeZone}`;
}

/** The attempt to queue now for a slot day with these jobs, or null when none is due. */
function dueAttempt(jobs: readonly Job[], nowMs: number): number | null {
  if (jobs.length === 0) return 1;
  // Queued, running, done or cancelled by the owner: nothing to add. A cancel by the worker's
  // stop ("Worker stopped") counts as an attempt that ended, like a failure.
  const settled = (job: Job) =>
    ["queued", "running", "ok"].includes(job.status) ||
    (job.status === "cancelled" && job.error === null);
  if (jobs.some(settled)) return null;
  if (jobs.length >= MAX_BACKUP_ATTEMPTS) return null;
  const last = jobs.at(-1);
  const endedAt = (last?.finishedAt ?? last?.createdAt)?.getTime() ?? nowMs;
  const wait = BACKOFF_MS[jobs.length - 1] ?? Number.POSITIVE_INFINITY;
  return nowMs - endedAt >= wait ? jobs.length + 1 : null;
}

export type BackupScheduleDeps = {
  db: Db;
  timeZone: string;
  /** False when HARBOUR_SCHEDULED_BACKUP is off: nothing is queued automatically. */
  enabled: boolean;
  clock: () => number;
};

/**
 * The worker's backup timetable: one backup per local day from 03:15, retried after 10 and
 * then 40 minutes, three attempts at most. Derived from the jobs table, so a restart never
 * queues twice and a worker that was down queues only the latest slot day's backup.
 */
export function makeBackupSchedule(deps: BackupScheduleDeps) {
  const { db, timeZone, enabled, clock } = deps;
  const checkDue = makeThrottle(CHECK_MS);
  return {
    /** Queues the latest slot day's backup when due (first attempt or a retry); every 30 s and on start. */
    tick(): { jobId: number; day: string; attempt: number } | null {
      if (!enabled) return null;
      const nowMs = clock();
      if (!checkDue(nowMs)) return null;
      const now = new Date(nowMs);
      const day = latestDailySlotDay(now, timeZone, BACKUP_MINUTE);
      const jobs = jobsCreatedSince(db, "backup", new Date(nowMs - LOOKBACK_MS)).filter(
        (job) => job.params.day === day,
      );
      const attempt = dueAttempt(jobs, nowMs);
      if (attempt === null) return null;
      const job = enqueueBackup(db, day, null, now);
      return job.created ? { jobId: job.id, day, attempt } : null;
    },
  };
}
