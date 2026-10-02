import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { localTime, zonedInstant } from "@/lib/format/zoned-time";
import { enqueueJob, jobsCreatedSince } from "@/lib/jobs/queue";
import { notePath, noteStamp } from "./stamp";

/** "Write me a fresh one" requests allowed per local day, on top of the scheduled note. */
export const MAX_ON_DEMAND_PER_DAY = 5;

/** Queues the note for `stamp` unless that one is already queued or running. */
export function enqueueDailyNote(
  db: Db,
  stamp: string,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  notePath(stamp); // throws unless `stamp` is a real note stamp
  return enqueueJob(db, "daily-note", { stamp }, requestedBy, now);
}

export type FreshNote =
  | { ok: true; jobId: number; created: boolean }
  | { ok: false; reason: "rate_limited" };

/**
 * The owner's request for a fresh note (spec §3.2): at most one run at a time (a second request
 * returns the waiting job) and at most MAX_ON_DEMAND_PER_DAY a local day. The scheduled note
 * (no requester) does not count against the owner.
 */
export function requestFreshNote(
  db: Db,
  input: { timeZone: string; login: string; now: Date },
): FreshNote {
  const { timeZone, login, now } = input;
  const active = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.kind, "daily-note"), inArray(jobs.status, ["queued", "running"])))
    .get();
  if (active) return { ok: true, jobId: active.id, created: false };
  const local = localTime(timeZone, now);
  const since = zonedInstant(local.day, 0, timeZone);
  const asked = jobsCreatedSince(db, "daily-note", since).filter((j) => j.requestedBy !== null);
  if (asked.length >= MAX_ON_DEMAND_PER_DAY) return { ok: false, reason: "rate_limited" };
  const job = enqueueDailyNote(db, noteStamp(local), login, now);
  return { ok: true, jobId: job.id, created: job.created };
}
