import type { Db } from "@/lib/db/client";
import { addEvent, finishJob, type Job } from "./queue";

/** Fails a job the worker has no runner for, instead of handing it to the agent runner. */
export function failUnknownJob(db: Db, job: Job, now = new Date()): void {
  const message = `Unknown job kind: ${job.kind}`;
  addEvent(db, job.id, "error", message, now);
  finishJob(db, job.id, "failed", message, now);
}
