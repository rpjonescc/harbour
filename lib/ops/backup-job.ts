// Runs a queued backup job: events for the Agents page, then a terminal state. Worker only.

import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { addEvent, finishJob, isCancelRequested, type Job } from "@/lib/jobs/queue";
import { type BackupResult, BackupStopped, runBackup } from "./backup";
import { backupDirFor, backupFileName } from "./backup-files";

export type OpsJobDeps = {
  db: Db;
  config: Config;
  productIds: () => readonly string[];
  now: () => Date;
  stopping: () => boolean;
};

/** "Backup verified: 12.4 MB, 3,021 pages in 2.1 s; 14 kept, 1 removed (harbour-2026-09-18.db)". */
export function describeBackup(result: BackupResult): string {
  const mb = (result.bytes / 1_000_000).toFixed(1);
  const pages = result.pages.toLocaleString("en-US");
  const seconds = (result.ms / 1000).toFixed(1);
  const removed =
    result.pruned.length > 0
      ? `, ${result.pruned.length} removed (${result.pruned.join(", ")})`
      : "";
  return `Backup verified: ${mb} MB, ${pages} pages in ${seconds} s; ${result.kept} kept${removed}`;
}

const STOPPED = "Worker stopped";

/**
 * Backs up the database for the job's `day`; a failure fails the job with its reason. Cancel
 * and worker stop abandon the copy: cancelled, with "Worker stopped" as the error for a stop
 * (the schedule retries that one, but not an owner's cancel).
 */
export async function runBackupJob(deps: OpsJobDeps, job: Job): Promise<void> {
  const { db, config, now, stopping } = deps;
  try {
    const day = job.params.day ?? "";
    addEvent(db, job.id, "status", `Backing up to ${backupFileName(day)}`, now());
    const result = await runBackup(db, {
      dir: backupDirFor(config),
      day,
      now: () => now().getTime(),
      shouldStop: () => stopping() || isCancelRequested(db, job.id),
    });
    addEvent(db, job.id, "status", describeBackup(result), now());
    if (result.pruneError) {
      addEvent(db, job.id, "error", `Could not remove old backups: ${result.pruneError}`, now());
    }
    finishJob(db, job.id, "ok", null, now());
  } catch (error) {
    if (error instanceof BackupStopped) {
      const stopped = stopping();
      addEvent(db, job.id, "status", stopped ? STOPPED : "Cancelled", now());
      finishJob(db, job.id, "cancelled", stopped ? STOPPED : null, now());
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    addEvent(db, job.id, "error", message, now());
    finishJob(db, job.id, "failed", message, now());
  }
}
