// The worker's heartbeat. The worker writes it (worker/run.ts); the web process only reads it
// through `workerLiveness`. Must not import "server-only": the worker imports this module.

import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs, workerStatus } from "@/lib/db/schema";
import { guardTick } from "@/lib/jobs/guard-tick";

/** The worker beats at most this often, by its own clock. */
export const BEAT_EVERY_MS = 30_000;

/** Records that the worker has just started: a fresh beat and a new start time. */
export function markWorkerStarted(db: Db, now: Date): void {
  db.insert(workerStatus)
    .values({ id: 1, beatAt: now, startedAt: now })
    .onConflictDoUpdate({ target: workerStatus.id, set: { beatAt: now, startedAt: now } })
    .run();
}

/**
 * Records a beat. The start time is set only when there is no row yet (the first beat ever);
 * otherwise it stays as `markWorkerStarted` left it.
 */
export function recordWorkerBeat(db: Db, now: Date): void {
  db.insert(workerStatus)
    .values({ id: 1, beatAt: now, startedAt: now })
    .onConflictDoUpdate({ target: workerStatus.id, set: { beatAt: now } })
    .run();
}

/**
 * Throttles `beat` to once per `everyMs` by `clock`. A beat that throws is not counted, so the
 * next call tries again; the caller guards the throw (guardTick), so it never stops the worker.
 */
export function beatEvery(
  everyMs: number,
  clock: () => number,
  beat: (now: Date) => void,
): () => void {
  let last: number | null = null;
  return () => {
    const now = clock();
    if (last !== null && now - last < everyMs) return;
    beat(new Date(now));
    last = now;
  };
}

/**
 * Starts the worker's heartbeat: marks the start, then beats on a timer and on each `beat()` call
 * (one per loop pass), at most every 30 s. The timer keeps a live worker looking alive while a
 * long job runs. Every write is guarded: a failed one is logged and never stops the worker.
 */
export function startWorkerBeat(
  db: Db,
  clock: () => number = Date.now,
): { beat: () => void; stop: () => void } {
  guardTick("worker start", () => markWorkerStarted(db, new Date(clock())))();
  const beat = guardTick(
    "worker beat",
    beatEvery(BEAT_EVERY_MS, clock, (at) => recordWorkerBeat(db, at)),
  );
  const timer = setInterval(beat, BEAT_EVERY_MS);
  timer.unref();
  return { beat: () => void beat(), stop: () => clearInterval(timer) };
}

export type WorkerLiveness = {
  /** The newer of the last beat and a running job's heartbeat; null when neither exists. */
  lastSeen: Date | null;
  startedAt: Date | null;
  /** A job is running now (its heartbeat counts as the worker being alive). */
  runningJob: boolean;
};

const newer = (a: Date | null, b: Date | null) =>
  a === null ? b : b === null ? a : a.getTime() >= b.getTime() ? a : b;

/** Whether the worker is alive, read from its beat and any running job's heartbeat. */
export function workerLiveness(db: Db, now: Date): WorkerLiveness {
  const row = db.select().from(workerStatus).where(eq(workerStatus.id, 1)).get();
  const running = db
    .select({ heartbeatAt: jobs.heartbeatAt, startedAt: jobs.startedAt })
    .from(jobs)
    .where(and(eq(jobs.status, "running"), isNotNull(jobs.startedAt)))
    .orderBy(desc(jobs.id))
    .limit(1)
    .get();
  const jobSeen = running ? (running.heartbeatAt ?? running.startedAt) : null;
  // A time ahead of `now` (a clock step) is read as now, so it never looks fresher than it is.
  const seen = newer(row?.beatAt ?? null, jobSeen);
  return {
    lastSeen: seen && seen.getTime() > now.getTime() ? now : seen,
    startedAt: row?.startedAt ?? null,
    runningJob: running !== undefined,
  };
}
