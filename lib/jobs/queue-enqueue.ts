import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import type { JobKind } from "./queue";

// Putting a job on the queue: dedupe, and the version a caller runs inside its own transaction
// (a chained content step is queued by the transaction that finishes the step before it).
// `queue.ts` re-exports these, so callers keep importing from "@/lib/jobs/queue".

function dedupeKeyFor(kind: JobKind, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => [k, params[k]]);
  return `${kind}:${JSON.stringify(sorted)}`;
}

/** The statements a queue write needs: a top-level database or a transaction. */
export type JobWriter = Pick<Db, "select" | "insert">;

/** The id of the queued or running job identical to this one, if any. */
export function findActiveJob(
  tx: JobWriter,
  kind: JobKind,
  params: Record<string, string>,
): number | null {
  const active = tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.dedupeKey, dedupeKeyFor(kind, params)),
        inArray(jobs.status, ["queued", "running"]),
      ),
    )
    .get();
  return active?.id ?? null;
}

/** `enqueueJob` inside a transaction the caller already holds (it must be IMMEDIATE). */
export function enqueueJobIn(
  tx: JobWriter,
  kind: JobKind,
  params: Record<string, string>,
  requestedBy: string | null,
  now: Date,
): { id: number; created: boolean } {
  const existing = findActiveJob(tx, kind, params);
  if (existing !== null) return { id: existing, created: false };
  const row = tx
    .insert(jobs)
    .values({
      kind,
      params,
      dedupeKey: dedupeKeyFor(kind, params),
      status: "queued",
      requestedBy,
      createdAt: now,
    })
    .returning({ id: jobs.id })
    .get();
  return { id: row.id, created: true };
}

/** Queues a job unless an identical one is already queued or running. */
export function enqueueJob(
  db: Db,
  kind: JobKind,
  params: Record<string, string>,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  return db.transaction((tx) => enqueueJobIn(tx, kind, params, requestedBy, now), {
    behavior: "immediate",
  });
}
