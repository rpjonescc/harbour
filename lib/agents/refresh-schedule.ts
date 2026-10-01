import { and, eq, inArray } from "drizzle-orm";
import { checkBrainRoot } from "@/lib/brain/docs";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { latestMonthlySlot, localTime, nextMonthlySlot } from "@/lib/format/zoned-time";
import { enqueueJob, jobsCreatedSince } from "@/lib/jobs/queue";
import { makeThrottle } from "@/lib/jobs/throttle";
import { MAX_REFRESHES, staleTopics, topicAges } from "./research-age";

const CHECK_MS = 30_000;
const BRAIN_PROBLEM = {
  missing: "missing",
  "not-directory": "not a folder",
  unreadable: "unreadable",
};

export type QueuedRefresh = { jobId: number; topicId: string };

/** Each topic with a research job (sprint or refresh) queued or running, and that job's id. */
function activeResearchJobs(db: Db): Map<string, number> {
  const rows = db
    .select({ id: jobs.id, params: jobs.params })
    .from(jobs)
    .where(and(eq(jobs.kind, "research"), inArray(jobs.status, ["queued", "running"])))
    .all();
  return new Map(rows.map((row) => [row.params.topic ?? "", row.id]));
}

// Immediate: the web and the worker both queue research, so the active-topic read and the
// inserts must not interleave with the other process's.
const IMMEDIATE = { behavior: "immediate" } as const;

/**
 * Queues a research-sprint run per topic, except a topic that already has a research job
 * queued or running (a refresh included): its job id is returned instead.
 */
export function enqueueResearch(
  db: Db,
  topics: readonly string[],
  requestedBy: string | null,
  now = new Date(),
): number[] {
  return db.transaction(() => {
    const active = activeResearchJobs(db);
    return topics.map(
      (topic) => active.get(topic) ?? enqueueJob(db, "research", { topic }, requestedBy, now).id,
    );
  }, IMMEDIATE);
}

/** Queues up to 3 stale topics, skipping any topic with a research job already queued or running. */
export function queueRefreshes(
  db: Db,
  input: {
    root: string;
    today: string;
    requestedBy: string | null;
    month: string | null;
    now: Date;
  },
): { queued: QueuedRefresh[]; stale: number } {
  const stale = staleTopics(topicAges(input.root), input.today); // file reads: outside the lock
  const queued = db.transaction(() => {
    const active = activeResearchJobs(db);
    return stale
      .filter((age) => !active.has(age.topicId))
      .slice(0, MAX_REFRESHES)
      .map((age) => {
        const params: Record<string, string> = { topic: age.topicId, mode: "refresh" };
        if (input.month) params.month = input.month;
        const job = enqueueJob(db, "research", params, input.requestedBy, input.now);
        return { jobId: job.id, topicId: age.topicId };
      });
  }, IMMEDIATE);
  return { queued, stale: stale.length };
}

/** When the schedule next queues a refresh round (first Sunday 21:00 local), or null when off. */
export function nextMonthlyRefresh(now: Date, timeZone: string, enabled: boolean): Date | null {
  return enabled ? nextMonthlySlot(now, timeZone) : null;
}

function roundQueued(db: Db, slot: { at: Date; month: string }): boolean {
  return jobsCreatedSince(db, "research", slot.at).some((job) => job.params.month === slot.month);
}

export type RefreshScheduleDeps = {
  db: Db;
  root: string;
  timeZone: string;
  /** False when HARBOUR_SCHEDULED_RESEARCH is off: nothing is queued automatically. */
  enabled: boolean;
  /** Whether HARBOUR_CLAUDE_OAUTH_TOKEN is set: without it the runs could only fail. */
  tokenSet: boolean;
  clock: () => number;
};

/**
 * The worker's research refresh timetable: one round a month from the first Sunday at 21:00
 * local (after the weekly analyst's 20:00 slot), keyed by the month on the jobs it queues. A
 * round that queued anything never runs again that month, even if its runs failed (no automatic
 * retry); a worker that was down over the slot catches up once, for the latest slot's month.
 */
export function makeRefreshSchedule(deps: RefreshScheduleDeps) {
  const { db, root, timeZone, enabled, tokenSet, clock } = deps;
  const checkDue = makeThrottle(CHECK_MS);
  const told = new Set<string>(); // log lines already written, so each appears once
  const tellOnce = (line: string) => {
    if (!told.has(line)) console.log(line);
    told.add(line);
  };
  let settledMonth: string | null = null; // a month whose round found nothing to queue

  return {
    /** Queues the latest slot's round if it has not run; called on start and every 30 s. */
    tick(): QueuedRefresh[] {
      if (!enabled) return [];
      const nowMs = clock();
      if (!checkDue(nowMs)) return [];
      const now = new Date(nowMs);
      const slot = latestMonthlySlot(now, timeZone);
      if (slot.month === settledMonth || roundQueued(db, slot)) return [];
      if (!tokenSet) {
        tellOnce("research refresh skipped: no Claude token");
        return [];
      }
      const brain = checkBrainRoot(root);
      if (!brain.ok) {
        tellOnce(`research refresh skipped: the brain folder is ${BRAIN_PROBLEM[brain.reason]}`);
        return [];
      }
      const today = localTime(timeZone, now).day;
      const result = queueRefreshes(db, { root, today, requestedBy: null, month: slot.month, now });
      if (result.queued.length === 0) {
        settledMonth = slot.month;
        console.log(
          result.stale === 0
            ? `research refresh: nothing stale for ${slot.month}`
            : `research refresh: every stale document already has a research job for ${slot.month}`,
        );
      }
      return result.queued;
    },
  };
}
