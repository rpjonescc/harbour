// Bounded reads of the jobs table for the tower's Agents light, Needs you and the activity feed.

import { and, count, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { localMoment, zonedInstant } from "@/lib/format/zoned-time";
import { AGENT_JOB_KINDS } from "@/lib/jobs/job-kinds";
import type { Job, JobKind } from "@/lib/jobs/queue";

/** Every list read here stops at this many rows. */
export const JOB_LIMIT = 50;
const DAY_MS = 24 * 60 * 60_000;
const AGENT_KINDS = [...AGENT_JOB_KINDS];

/** Agent jobs in `status`, oldest first, at most 50. */
function agentJobsIn(db: Db, status: "queued" | "running"): Job[] {
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, status), inArray(jobs.kind, AGENT_KINDS)))
    .orderBy(jobs.id)
    .limit(JOB_LIMIT)
    .all();
}

/** Whether an ok job of `kind` came after job `id`. */
function retriedOk(db: Db, kind: JobKind, id: number): boolean {
  const later = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.kind, kind), eq(jobs.status, "ok"), gt(jobs.id, id)))
    .limit(1)
    .get();
  return later !== undefined;
}

/**
 * Agent runs that failed in the last 24 hours with no later successful run of the same kind,
 * oldest first (at most 50).
 */
export function failedUnretried(db: Db, now: Date): Job[] {
  const since = new Date(now.getTime() - DAY_MS);
  const failed = db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.status, "failed"), inArray(jobs.kind, AGENT_KINDS), gte(jobs.finishedAt, since)),
    )
    .orderBy(desc(jobs.id))
    .limit(JOB_LIMIT)
    .all();
  return failed.filter((job) => !retriedOk(db, job.kind, job.id)).reverse();
}

/** What the Agents light reads: running, waiting, failed and not retried, finished today. */
export function agentActivity(db: Db, now: Date, timeZone: string) {
  const midnight = zonedInstant(localMoment(timeZone, now).day, 0, timeZone);
  const finished = db
    .select({ n: count() })
    .from(jobs)
    .where(
      and(eq(jobs.status, "ok"), inArray(jobs.kind, AGENT_KINDS), gte(jobs.finishedAt, midnight)),
    )
    .get();
  return {
    running: agentJobsIn(db, "running"),
    queued: agentJobsIn(db, "queued"),
    failedUnretried: failedUnretried(db, now),
    finishedToday: finished?.n ?? 0,
  };
}

/** The newest finished (ok or failed) job of `kind`; `refresh` narrows research to refreshes. */
export function lastFinishedJob(
  db: Db,
  kind: JobKind,
  refresh = false,
): { status: "ok" | "failed"; at: Date } | null {
  const row = db
    .select({ status: jobs.status, finishedAt: jobs.finishedAt, createdAt: jobs.createdAt })
    .from(jobs)
    .where(
      and(
        eq(jobs.kind, kind),
        inArray(jobs.status, ["ok", "failed"]),
        refresh ? sql`json_extract(${jobs.params}, '$.mode') = 'refresh'` : undefined,
      ),
    )
    .orderBy(desc(jobs.id))
    .get();
  if (!row || (row.status !== "ok" && row.status !== "failed")) return null;
  return { status: row.status, at: row.finishedAt ?? row.createdAt };
}
