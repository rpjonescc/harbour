import { and, asc, count, desc, eq, gt, inArray, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { agentRunEvents, jobs } from "@/lib/db/schema";

export type JobKind = "research" | "discovery" | "brain-push" | "notes-sync";
export type JobStatus = "queued" | "running" | "ok" | "failed" | "cancelled";
export type Job = typeof jobs.$inferSelect;
export type EventKind = "status" | "tool" | "text" | "error";

export const MAX_EVENTS = 200;
const STALE_MS = 60_000;

function dedupeKeyFor(kind: JobKind, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => [k, params[k]]);
  return `${kind}:${JSON.stringify(sorted)}`;
}

/** Queues a job unless an identical one is already queued or running. */
export function enqueueJob(
  db: Db,
  kind: JobKind,
  params: Record<string, string>,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  const dedupeKey = dedupeKeyFor(kind, params);
  return db.transaction((tx) => {
    const active = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.dedupeKey, dedupeKey), inArray(jobs.status, ["queued", "running"])))
      .get();
    if (active) return { id: active.id, created: false };
    const row = tx
      .insert(jobs)
      .values({ kind, params, dedupeKey, status: "queued", requestedBy, createdAt: now })
      .returning({ id: jobs.id })
      .get();
    return { id: row.id, created: true };
  });
}

/** Atomically moves the oldest queued job to running. */
export function claimNextJob(db: Db, now = new Date()): Job | null {
  return db.transaction((tx) => {
    const next = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, "queued"))
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
  });
}

export function heartbeat(db: Db, id: number, now = new Date()): void {
  db.update(jobs)
    .set({ heartbeatAt: now })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
    .run();
}

export function finishJob(
  db: Db,
  id: number,
  status: "ok" | "failed" | "cancelled",
  error: string | null,
  now = new Date(),
): void {
  db.update(jobs).set({ status, error, finishedAt: now }).where(eq(jobs.id, id)).run();
}

/** Queued jobs are cancelled at once; running jobs are flagged for the worker. */
export function requestCancel(
  db: Db,
  id: number,
  now = new Date(),
): "cancelled" | "requested" | "not-active" {
  const job = getJob(db, id);
  if (job?.status === "queued") {
    finishJob(db, id, "cancelled", null, now);
    return "cancelled";
  }
  if (job?.status === "running") {
    db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, id)).run();
    return "requested";
  }
  return "not-active";
}

export function isCancelRequested(db: Db, id: number): boolean {
  return db.select({ c: jobs.cancelRequested }).from(jobs).where(eq(jobs.id, id)).get()?.c === true;
}

/** Marks running jobs with a stale heartbeat as failed (the worker died mid-run). */
export function recoverStaleJobs(db: Db, now = new Date(), staleMs = STALE_MS): number {
  const cutoff = new Date(now.getTime() - staleMs);
  return db
    .update(jobs)
    .set({
      status: "failed",
      finishedAt: now,
      error: "Worker stopped during run — check the brain repo for partial changes (git status)",
    })
    .where(and(eq(jobs.status, "running"), lt(jobs.heartbeatAt, cutoff)))
    .returning({ id: jobs.id })
    .all().length;
}

export function listJobs(db: Db, limit = 30): Job[] {
  return db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit).all();
}

export function getJob(db: Db, id: number): Job | undefined {
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}

/** Appends an activity line, keeping at most MAX_EVENTS plus one "limit reached" note. */
export function addEvent(
  db: Db,
  jobId: number,
  kind: EventKind,
  text: string,
  now = new Date(),
): void {
  const n =
    db.select({ n: count() }).from(agentRunEvents).where(eq(agentRunEvents.jobId, jobId)).get()
      ?.n ?? 0;
  if (n > MAX_EVENTS) return;
  const value =
    n === MAX_EVENTS
      ? {
          jobId,
          at: now,
          kind: "status" as const,
          text: "Activity limit reached — further steps not recorded",
        }
      : { jobId, at: now, kind, text: text.slice(0, 500) };
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
