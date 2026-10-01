import { and, gte, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { scores } from "@/lib/db/schema";
import { enqueueJob, jobsCreatedSince } from "@/lib/jobs/queue";
import { makeThrottle } from "@/lib/jobs/throttle";
import { isWeekLabel, latestWeeklySlot, nextWeeklySlot } from "./week";

const CHECK_MS = 30_000;
/** The report needs a scored scan this recent, or it would be a report on nothing. */
const SCAN_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type AnalystScheduleDeps = {
  db: Db;
  timeZone: string;
  /** False when HARBOUR_SCHEDULED_ANALYST is off: nothing is queued automatically. */
  enabled: boolean;
  /** Whether HARBOUR_CLAUDE_OAUTH_TOKEN is set: without it the run could only fail. */
  tokenSet: boolean;
  clock: () => number;
  productIds: () => readonly string[];
};

/** Queues a weekly-analyst job for the current local ISO week (deduped by week). */
export function enqueueWeeklyAnalyst(
  db: Db,
  week: string,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  if (!isWeekLabel(week)) throw new Error(`Invalid ISO week: ${week}`);
  return enqueueJob(db, "weekly-analyst", { week }, requestedBy, now);
}

/** When the schedule next queues a run (Sunday 20:00 local), or null when it is off. */
export function nextWeeklyRun(now: Date, timeZone: string, enabled: boolean): Date | null {
  return enabled ? nextWeeklySlot(now, timeZone) : null;
}

function hasRecentScores(db: Db, productIds: readonly string[], now: Date): boolean {
  if (productIds.length === 0) return false;
  const since = new Date(now.getTime() - SCAN_WINDOW_MS);
  const row = db
    .select({ id: scores.id })
    .from(scores)
    .where(and(inArray(scores.productId, [...productIds]), gte(scores.computedAt, since)))
    .get();
  return row !== undefined;
}

/**
 * The worker's weekly analyst timetable: one run per ISO week from Sunday 20:00 local. Derived
 * from the jobs table, so a restart never queues twice and a worker that was down at the slot
 * queues exactly one run, for that Sunday's week, at its first check. A failed run is not
 * retried automatically: the owner can Run now.
 */
export function makeAnalystSchedule(deps: AnalystScheduleDeps) {
  const { db, timeZone, enabled, tokenSet, clock, productIds } = deps;
  const checkDue = makeThrottle(CHECK_MS);
  let toldNoToken = false;
  let toldNoScans: string | null = null; // the week last skipped for want of scans

  /** The slot's run is still to queue: nothing was created since that slot's time. */
  const due = (now: Date) => {
    const slot = latestWeeklySlot(now, timeZone);
    return jobsCreatedSince(db, "weekly-analyst", slot.at).length === 0 ? slot : null;
  };

  return {
    /** Queues the latest slot's run if none was created since that slot. Called on start and every 30 s. */
    tick(): { jobId: number; week: string } | null {
      if (!enabled) return null;
      const nowMs = clock();
      if (!checkDue(nowMs)) return null;
      const now = new Date(nowMs);
      const slot = due(now);
      if (!slot) return null;
      if (!tokenSet) {
        if (!toldNoToken) console.log("weekly analyst skipped: no Claude token");
        toldNoToken = true;
        return null;
      }
      if (!hasRecentScores(db, productIds(), now)) {
        if (toldNoScans !== slot.week)
          console.log("weekly analyst skipped: no scan data this week");
        toldNoScans = slot.week;
        return null;
      }
      const job = enqueueWeeklyAnalyst(db, slot.week, null, now);
      return job.created ? { jobId: job.id, week: slot.week } : null;
    },
  };
}
