import type { Db } from "@/lib/db/client";
import { housekeepingAction } from "./housekeeping";
import { addEvent, enqueueJob, recoverRunningJobs } from "./queue";
import { pendingRecovery, recoverRuns } from "./run-marker";

const CHECK_MS = 30_000;
const QUIET_MS = 2 * 60_000;
const RETRY_MS = 10 * 60_000;
const MAX_PUSH_RETRY_MS = 6 * 60 * 60_000;

/** Wait before the next push retry: 10 min, doubling per consecutive failure, at most 6 h. */
export function pushRetryDelay(failures: number): number {
  const exponent = Math.max(0, Math.min(failures - 1, 16));
  return Math.min(RETRY_MS * 2 ** exponent, MAX_PUSH_RETRY_MS);
}

export type SchedulerDeps = {
  db: Db;
  root: string;
  quarantineRoot: string;
  clock: () => number;
  action?: typeof housekeepingAction;
  recover?: typeof recoverRuns;
};

/**
 * The worker's between-jobs duties: recover interrupted runs, autosave the owner's quiet edits,
 * retry unpushed commits with backoff. The worker calls `tick` only when no job is running.
 */
export function makeScheduler(deps: SchedulerDeps) {
  const { db, root, quarantineRoot, clock } = deps;
  const action = deps.action ?? housekeepingAction;
  const recover = deps.recover ?? recoverRuns;
  let lastCheck = Number.NEGATIVE_INFINITY;
  let nextPushAt = 0;
  let pushFailures = 0;
  let notesRetryAt = 0;
  let nextRecoveryAt = 0;

  const jobEvent = (jobId: string, text: string) => {
    try {
      addEvent(db, Number(jobId), "status", text);
    } catch {
      // the job row may be gone (database reset); the log line below still records it
    }
  };

  const recoverNow = () => {
    const now = clock();
    const result = recover(root, quarantineRoot);
    for (const r of result.recovered) {
      const text = `Recovered: ${r.quarantined.length} file(s) moved to quarantine (${r.dir})`;
      console.log(`job ${r.jobId}: ${text}`);
      jobEvent(r.jobId, text);
    }
    for (const f of result.failed) console.error(`job ${f.jobId}: recovery failed: ${f.error}`);
    nextRecoveryAt = result.failed.length > 0 ? now + RETRY_MS : 0;
  };

  /** Result of a push: failures back off exponentially, success resets. */
  const pushed = (ok: boolean) => {
    pushFailures = ok ? 0 : pushFailures + 1;
    nextPushAt = clock() + pushRetryDelay(pushFailures);
  };

  return {
    pushed,
    /** Fails every job left running by a previous worker, then recovers interrupted runs. */
    startup() {
      const orphaned = recoverRunningJobs(db, new Date(clock()));
      if (orphaned.length > 0) console.warn(`recovered ${orphaned.length} interrupted job(s)`);
      const pending = new Set(pendingRecovery(quarantineRoot));
      for (const id of orphaned) {
        if (pending.has(String(id))) jobEvent(String(id), "Worker restarted: recovering this run");
      }
      if (pending.size > 0) recoverNow();
    },
    tick() {
      const now = clock();
      if (now >= nextRecoveryAt && pendingRecovery(quarantineRoot).length > 0) recoverNow();
      if (now - lastCheck < CHECK_MS) return;
      lastCheck = now;
      const next = action(root, new Date(now), {
        quietMs: QUIET_MS,
        pushRetryDue: now >= nextPushAt,
        quarantineRoot,
      });
      if (next === "notes-sync" && now >= notesRetryAt) enqueueJob(db, "notes-sync", {}, null);
      if (next === "brain-push") {
        nextPushAt = now + pushRetryDelay(pushFailures);
        enqueueJob(db, "brain-push", {}, null);
      }
    },
    /** Result of a notes-sync job: only a failed commit delays the next autosave. */
    notesSynced(outcome: { committed: boolean; pushed: boolean }) {
      notesRetryAt = outcome.committed ? 0 : clock() + RETRY_MS;
      if (outcome.pushed) pushed(true);
    },
  };
}
