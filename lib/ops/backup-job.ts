// Runs queued backup and retention jobs: events for the Agents page, then a terminal state.
// Worker only.

import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { addEvent, enqueueJob, finishJob, isCancelRequested, type Job } from "@/lib/jobs/queue";
import { type BackupResult, BackupStopped, runBackup } from "./backup";
import { backupDirFor, backupFileName } from "./backup-files";
import {
  applyRetention,
  describeProductPlan,
  describeRemoved,
  MAX_PLANNED_SCANS,
  planRetention,
  RETENTION_LIMITS,
} from "./retention";

export type OpsJobDeps = {
  db: Db;
  config: Config;
  productIds: () => readonly string[];
  now: () => Date;
  stopping: () => boolean;
  /** Retention's delete limits; tests lower them. */
  retention?: { batchRows: number; maxBatches: number };
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
 * (the schedule retries that one, but not an owner's cancel). A verified backup queues retention.
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
      const reason = result.pruneError.replaceAll(backupDirFor(config), "the backup folder");
      addEvent(db, job.id, "error", `Could not remove old backups: ${reason}`, now());
    }
    finishJob(db, job.id, "ok", null, now());
    queueRetention(deps, job, day);
  } catch (error) {
    if (error instanceof BackupStopped) {
      const stopped = stopping();
      addEvent(db, job.id, "status", stopped ? STOPPED : "Cancelled", now());
      finishJob(db, job.id, "cancelled", stopped ? STOPPED : null, now());
      return;
    }
    // The job page shows this text, so the folder's absolute path is not part of it.
    const raw = error instanceof Error ? error.message : String(error);
    const message = raw.replaceAll(backupDirFor(config), "the backup folder");
    addEvent(db, job.id, "error", message, now());
    finishJob(db, job.id, "failed", message, now());
  }
}

/** Only after a verified backup is there a copy of what retention deletes. */
function queueRetention({ db, now }: OpsJobDeps, job: Job, day: string): void {
  try {
    enqueueJob(db, "retention", { day }, null, now());
  } catch (error) {
    // The backup itself is done and stays ok; retention waits for the next night's backup.
    const message = error instanceof Error ? error.message : String(error);
    addEvent(db, job.id, "error", `Could not queue retention: ${message}`, now());
  }
}

const LATER = "the rest goes after tomorrow's backup";

/**
 * Deletes old scans' observations (queued by a verified backup). Each batch is its own
 * transaction, so a failure or stop keeps the batches done and leaves the rest for the next
 * night; nothing is retried before then.
 */
export async function runRetentionJob(deps: OpsJobDeps, job: Job): Promise<void> {
  const { db, config, now, stopping, retention = RETENTION_LIMITS } = deps;
  const status = (text: string) => addEvent(db, job.id, "status", text, now());
  try {
    const keep = config.HARBOUR_OBSERVATION_SCANS_KEPT;
    const plan = planRetention(db, keep);
    const due = plan.products.filter((p) => p.pruneScanIds.length > 0);
    if (due.length === 0) {
      status(`No old scans to prune (newest ${keep} kept, plus the latest result of each source)`);
      finishJob(db, job.id, "ok", null, now());
      return;
    }
    for (const product of due) status(describeProductPlan(product));
    const result = await applyRetention(db, plan, {
      ...retention,
      stopping: () => stopping() || isCancelRequested(db, job.id),
    });
    if (result.deleted > 0) status(describeRemoved(result));
    if (result.stopped) {
      const stopped = stopping();
      status(stopped ? STOPPED : "Cancelled");
      finishJob(db, job.id, "cancelled", stopped ? STOPPED : null, now());
      return;
    }
    if (!result.complete) {
      const limit = (retention.batchRows * retention.maxBatches).toLocaleString("en-US");
      status(`Stopped at the ${limit}-row limit; ${LATER}`);
    } else if (plan.truncated) status(`Pruned the oldest ${MAX_PLANNED_SCANS} scans; ${LATER}`);
    finishJob(db, job.id, "ok", null, now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addEvent(db, job.id, "error", message, now());
    finishJob(db, job.id, "failed", message, now());
  }
}
