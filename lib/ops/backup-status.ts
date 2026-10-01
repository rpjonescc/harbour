// Backup health for Settings and Today. Web-safe: lists the backup directory and reads job rows.

import { asc, desc, eq, min } from "drizzle-orm";
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { agentRunEvents, jobs } from "@/lib/db/schema";
import { latestDailySlotDay } from "@/lib/format/zoned-time";
import type { Job, JobStatus } from "@/lib/jobs/queue";
import { type BackupFile, backupDirFor, listBackups } from "./backup-files";
import { BACKUP_MINUTE, MAX_BACKUP_ATTEMPTS, nextBackupRun } from "./backup-schedule";

export type BackupHealth = "ok" | "none-yet" | "failed" | "stale" | "off" | "unreadable";

export type BackupStatus = {
  enabled: boolean;
  next: Date | null;
  /** Newest file on disk; null when there is none or the folder cannot be read. */
  latest: BackupFile | null;
  /** Files kept (at most BACKUPS_KEPT); null when the folder cannot be read (unknown, not 0). */
  count: number | null;
  /**
   * The newest backup job failed (or a worker stop cut it short), with no ok after it. Its error
   * names "the backup folder" instead of the folder's path.
   */
  lastFailure: { jobId: number; at: Date; error: string; attemptsLeft: number } | null;
  lastRetention: { jobId: number; at: Date; status: JobStatus; summary: string | null } | null;
  health: BackupHealth;
};

/** Long enough that a nightly backup should have happened at least once. */
const STALE_MS = 48 * 60 * 60_000;
/** More than a day's attempts plus manual runs: enough to count the newest day's attempts. */
const RECENT_JOBS = 20;

function recentJobs(db: Db, kind: "backup" | "retention", limit: number): Job[] {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.kind, kind))
    .orderBy(desc(jobs.id))
    .limit(limit)
    .all();
}

/** Attempts the schedule still makes for the failed job's day: none for a manual run or another day. */
function attemptsLeft(failed: Job, recent: readonly Job[], config: Config, now: Date): number {
  const day = failed.params.day;
  if (failed.requestedBy !== null || config.HARBOUR_SCHEDULED_BACKUP === "off") return 0;
  if (day !== latestDailySlotDay(now, config.HARBOUR_TIMEZONE, BACKUP_MINUTE)) return 0;
  const attempts = recent.filter((job) => job.params.day === day).length;
  return Math.max(0, MAX_BACKUP_ATTEMPTS - attempts);
}

/** A failed job, or one the worker's stop cancelled ("Worker stopped"); not an owner's cancel. */
const isFailure = (job: Job) =>
  job.status === "failed" || (job.status === "cancelled" && job.error !== null);

function lastFailureOf(recent: readonly Job[], config: Config, now: Date) {
  const newest = recent[0];
  if (!newest || !isFailure(newest)) return null;
  return {
    jobId: newest.id,
    at: newest.finishedAt ?? newest.createdAt,
    error: (newest.error ?? "Unknown error").replaceAll(backupDirFor(config), "the backup folder"),
    attemptsLeft: attemptsLeft(newest, recent, config, now),
  };
}

/** What the newest retention run did: its error, its "Removed …" line, else its last line. */
function lastRetentionOf(db: Db): BackupStatus["lastRetention"] {
  const [job] = recentJobs(db, "retention", 1);
  if (!job) return null;
  const at = job.finishedAt ?? job.createdAt;
  if (job.status === "failed") return { jobId: job.id, at, status: job.status, summary: job.error };
  const lines = db
    .select({ text: agentRunEvents.text })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.jobId, job.id))
    .orderBy(asc(agentRunEvents.id))
    .all()
    .map((event) => event.text);
  const summary = lines.findLast((text) => text.startsWith("Removed ")) ?? lines.at(-1) ?? null;
  return { jobId: job.id, at, status: job.status, summary };
}

/** When Harbour first queued anything: how long it has been running. */
function firstJobAt(db: Db): Date | null {
  return (
    db
      .select({ at: min(jobs.createdAt) })
      .from(jobs)
      .get()?.at ?? null
  );
}

const olderThan = (at: Date, now: Date) => now.getTime() - at.getTime() > STALE_MS;

function healthOf(status: Omit<BackupStatus, "health">, db: Db, now: Date): BackupHealth {
  const failure = status.lastFailure;
  if (failure && failure.attemptsLeft === 0) {
    // With the schedule on, a failure this old means no backup has run since: the worker is down.
    return status.enabled && olderThan(failure.at, now) ? "stale" : "failed";
  }
  if (status.count === null) return "unreadable";
  if (!status.enabled) return "off";
  const since = status.latest?.modifiedAt ?? firstJobAt(db);
  if (since && olderThan(since, now)) return "stale";
  return status.latest ? "ok" : "none-yet";
}

/** The backup files, or null when the folder cannot be read (a gap, never an empty folder). */
function readBackups(list: (dir: string) => BackupFile[], dir: string): BackupFile[] | null {
  try {
    return list(dir);
  } catch {
    // The error names the folder's path, so it is not shown: Settings says to check permissions.
    return null;
  }
}

/** Backup health in one place, for Settings and Today. `list` is for tests. */
export function backupStatus(
  db: Db,
  config: Config,
  now: Date,
  { list = listBackups }: { list?: (dir: string) => BackupFile[] } = {},
): BackupStatus {
  const enabled = config.HARBOUR_SCHEDULED_BACKUP === "on";
  const files = readBackups(list, backupDirFor(config));
  const status = {
    enabled,
    next: nextBackupRun(now, config.HARBOUR_TIMEZONE, enabled),
    latest: files?.[0] ?? null,
    count: files?.length ?? null,
    lastFailure: lastFailureOf(recentJobs(db, "backup", RECENT_JOBS), config, now),
    lastRetention: lastRetentionOf(db),
  };
  return { ...status, health: healthOf(status, db, now) };
}
