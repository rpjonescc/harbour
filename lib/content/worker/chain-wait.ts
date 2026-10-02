import { and, inArray, ne } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { addEvent, deferJob, finishJob, type Job } from "@/lib/jobs/queue";

/**
 * A draft for one idea waits while another idea's draft, atomise or gate job is queued or running
 * (spec §12.2: one idea's chain at a time). The chain controller queues each next step as soon as
 * one finishes, so an unfinished chain always has a queued or running job. Among drafts that are
 * only queued the oldest goes first, so waiting drafts never block one another. A job with no idea id
 * counts as another chain, so an unknown job never lets two chains overlap.
 */
export function waitsForOtherChain(db: Db, job: Pick<Job, "id" | "kind" | "params">): boolean {
  if (job.kind !== "content-draft") return false;
  return db
    .select({ id: jobs.id, kind: jobs.kind, status: jobs.status, params: jobs.params })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["queued", "running"]),
        inArray(jobs.kind, ["content-draft", "content-atomise", "content-gate"]),
        ne(jobs.id, job.id),
      ),
    )
    .all()
    .some(
      (other) =>
        other.params.ideaId !== job.params.ideaId &&
        // Two queued drafts must not wait for each other: the older goes first.
        (other.status === "running" || other.kind !== "content-draft" || other.id < job.id),
    );
}

const FIRST_DELAY_MS = 30_000;
const MAX_DELAY_MS = 5 * 60_000;
/** A draft that has waited this long for another idea's chain gives up: that chain is stuck. */
export const MAX_WAIT_MS = 6 * 60 * 60_000;
export const WAITING_NOTE = "Waiting for another idea to finish being written";
export const GAVE_UP_NOTE =
  "Another idea was still being written after six hours, so this one didn't start. Try Write this again.";

/** Backs off as the wait grows: 30 seconds at first, never more than five minutes. */
const delayAfter = (waitedMs: number) =>
  Math.min(MAX_DELAY_MS, Math.max(FIRST_DELAY_MS, Math.floor(waitedMs / 2)));

/**
 * Handles a claimed draft job that must wait for another idea's chain: puts it back in the queue
 * (noting once, in fixed words, that it is waiting) or, after six hours, fails it. Returns true
 * when the job was dealt with and must not run now.
 */
export function deferForOtherChain(db: Db, job: Job, now = new Date()): boolean {
  if (job.kind !== "content-draft" || !waitsForOtherChain(db, job)) return false;
  const waited = now.getTime() - job.createdAt.getTime();
  if (waited >= MAX_WAIT_MS) {
    addEvent(db, job.id, "error", GAVE_UP_NOTE, now);
    finishJob(db, job.id, "failed", GAVE_UP_NOTE, now);
    return true;
  }
  if (!deferJob(db, job.id, new Date(now.getTime() + delayAfter(waited)))) return true; // no longer ours
  // Once per job: a job already deferred carries notBefore when it is claimed again.
  if (job.notBefore === null) addEvent(db, job.id, "status", WAITING_NOTE, now);
  return true;
}
