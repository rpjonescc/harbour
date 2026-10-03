import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { agentRunEvents, agentRuns, jobs } from "@/lib/db/schema";
import { AGENT_JOB_KINDS } from "./job-kinds";

export type JobKind =
  | "research"
  | "discovery"
  | "brain-push"
  | "notes-sync"
  | "scan"
  | "outside-check"
  | "weekly-analyst"
  | "daily-note"
  | "backup"
  | "retention"
  | "content-digest"
  | "content-ideas"
  | "content-draft"
  | "content-atomise"
  | "content-gate"
  | "content-decision"
  | "content-postiz";
export type JobStatus = "queued" | "running" | "ok" | "failed" | "cancelled";
export type Job = typeof jobs.$inferSelect;
export type EventKind = "status" | "tool" | "text" | "error";

/** Ceiling on every event of a job. */
export const MAX_EVENTS = 220;
/**
 * The agent's own steps (tool/text) stop at this, leaving room under MAX_EVENTS for the
 * worker's status and error lines (commit, push, failure) that the owner must always see.
 */
export const MAX_STREAM_EVENTS = 180;
const LIMIT_NOTE = "Activity limit reached — further agent steps not recorded";
const STREAM_KINDS: EventKind[] = ["tool", "text"];
const STALE_MS = 60_000;
/** Import attempts per agent run, the run's own included; then the owner must run it again. */
export const MAX_IMPORT_ATTEMPTS = 3;

export {
  enqueueJob,
  enqueueJobIn,
  findActiveJob,
  type JobWriter,
} from "./queue-enqueue";

/** Atomically moves the oldest queued job that is due (see `deferJob`) to running. */
export function claimNextJob(db: Db, now = new Date()): Job | null {
  return db.transaction(
    (tx) => {
      const next = tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.status, "queued"), or(isNull(jobs.notBefore), lte(jobs.notBefore, now))))
        .orderBy(asc(jobs.id))
        .get();
      if (!next) return null;
      return (
        tx
          .update(jobs)
          .set({ status: "running", startedAt: now, heartbeatAt: now })
          .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
          .returning()
          .get() ?? null
      );
    },
    { behavior: "immediate" },
  );
}

/** Puts a running job back in the queue, not to be claimed before `until`. */
export function deferJob(db: Db, id: number, until: Date): boolean {
  return (
    db
      .update(jobs)
      .set({ status: "queued", notBefore: until, startedAt: null, heartbeatAt: null })
      .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
      .returning({ id: jobs.id })
      .all().length > 0
  );
}

export function heartbeat(db: Db, id: number, now = new Date()): void {
  db.update(jobs)
    .set({ heartbeatAt: now })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
    .run();
}

/** Moves a running job to a terminal state. Returns false if it was no longer running. */
export function finishJob(
  db: Pick<Db, "update">,
  id: number,
  status: "ok" | "failed" | "cancelled",
  error: string | null,
  now = new Date(),
  result: string | null = null,
): boolean {
  return (
    db
      .update(jobs)
      .set({ status, error, finishedAt: now, result })
      .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
      .returning({ id: jobs.id })
      .all().length > 0
  );
}

/** Queued jobs are cancelled at once; running jobs are flagged for the worker. */
export function requestCancel(
  db: Db,
  id: number,
  now = new Date(),
): "cancelled" | "requested" | "not-active" {
  const cancelled = db
    .update(jobs)
    .set({ status: "cancelled", finishedAt: now })
    .where(and(eq(jobs.id, id), eq(jobs.status, "queued")))
    .returning({ id: jobs.id })
    .all();
  if (cancelled.length > 0) return "cancelled";
  const flagged = db
    .update(jobs)
    .set({ cancelRequested: true })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
    .returning({ id: jobs.id })
    .all();
  return flagged.length > 0 ? "requested" : "not-active";
}

export function isCancelRequested(db: Db, id: number): boolean {
  return db.select({ c: jobs.cancelRequested }).from(jobs).where(eq(jobs.id, id)).get()?.c === true;
}

/** Marks running jobs with a stale heartbeat as failed (the worker died mid-run). */
export function recoverStaleJobs(db: Db, now = new Date(), staleMs = STALE_MS): number {
  const cutoff = new Date(now.getTime() - staleMs);
  return failRunning(
    db,
    now,
    "Worker stopped during run — check the brain repo for partial changes (git status)",
    or(isNull(jobs.heartbeatAt), lt(jobs.heartbeatAt, cutoff)),
  ).length;
}

/**
 * At worker start every running job is orphaned (the worker is the only runner), whatever its
 * heartbeat says. Returns their ids so their partial changes can be recovered.
 */
export function recoverRunningJobs(db: Db, now = new Date()): number[] {
  const agent = failRunning(
    db,
    now,
    "Worker stopped during run — partial changes moved to quarantine",
    inArray(jobs.kind, [...AGENT_JOB_KINDS]),
  );
  return [...agent, ...failRunning(db, now, "Worker stopped")].sort((a, b) => a - b);
}

function failRunning(db: Db, now: Date, error: string, extra?: SQL): number[] {
  return db
    .update(jobs)
    .set({ status: "failed", finishedAt: now, error })
    .where(and(eq(jobs.status, "running"), extra))
    .returning({ id: jobs.id })
    .all()
    .map((row) => row.id);
}

/** Jobs of `kind` created at or after `since`, oldest first. */
export function jobsCreatedSince(db: Db, kind: JobKind, since: Date): Job[] {
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.kind, kind), gte(jobs.createdAt, since)))
    .orderBy(asc(jobs.id))
    .all();
}

export function listJobs(db: Db, limit = 30): Job[] {
  return db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit).all();
}

export function getJob(db: Db, id: number): Job | undefined {
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}

/** The agent run record (commit, files changed) of a research or discovery job. */
export function getAgentRun(db: Db, jobId: number): typeof agentRuns.$inferSelect | undefined {
  return db.select().from(agentRuns).where(eq(agentRuns.jobId, jobId)).get();
}

/** Of `jobIds`, the runs whose output was committed but never imported, out of attempts. */
export function importsGivenUp(db: Db, jobIds: readonly number[]): Set<number> {
  if (jobIds.length === 0) return new Set();
  const rows = db
    .select({ jobId: agentRuns.jobId })
    .from(agentRuns)
    .where(
      and(
        inArray(agentRuns.jobId, [...jobIds]),
        isNotNull(agentRuns.commitSha),
        isNull(agentRuns.importedAt),
        gte(agentRuns.importAttempts, MAX_IMPORT_ATTEMPTS),
      ),
    )
    .all();
  return new Set(rows.map((row) => row.jobId));
}

function countEvents(db: Db, jobId: number, extra?: SQL): number {
  return (
    db
      .select({ n: count() })
      .from(agentRunEvents)
      .where(and(eq(agentRunEvents.jobId, jobId), extra))
      .get()?.n ?? 0
  );
}

/**
 * Appends an activity line. The agent's steps stop at MAX_STREAM_EVENTS with one "limit reached"
 * note; worker status and errors are recorded up to MAX_EVENTS in total.
 */
export function addEvent(
  db: Db,
  jobId: number,
  kind: EventKind,
  text: string,
  now = new Date(),
): void {
  if (countEvents(db, jobId) >= MAX_EVENTS) return;
  let value = { jobId, at: now, kind, text: text.slice(0, 500) };
  if (STREAM_KINDS.includes(kind)) {
    const steps = countEvents(db, jobId, inArray(agentRunEvents.kind, STREAM_KINDS));
    if (steps >= MAX_STREAM_EVENTS) {
      if (countEvents(db, jobId, eq(agentRunEvents.text, LIMIT_NOTE)) > 0) return;
      value = { jobId, at: now, kind: "status", text: LIMIT_NOTE };
    }
  }
  db.insert(agentRunEvents).values(value).run();
}

export function eventsSince(db: Db, jobId: number, afterId: number) {
  return db
    .select({
      id: agentRunEvents.id,
      at: agentRunEvents.at,
      kind: agentRunEvents.kind,
      text: agentRunEvents.text,
    })
    .from(agentRunEvents)
    .where(and(eq(agentRunEvents.jobId, jobId), gt(agentRunEvents.id, afterId)))
    .orderBy(asc(agentRunEvents.id))
    .all();
}
