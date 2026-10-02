import { and, inArray, ne } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import type { Job } from "@/lib/jobs/queue";

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
