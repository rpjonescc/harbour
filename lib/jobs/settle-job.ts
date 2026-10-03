import type { Db } from "@/lib/db/client";
import { addEvent, finishJob, type Job } from "./queue";

/** The job's error when its runner returned without recording a result. */
export const LEFT_RUNNING =
  "Stopped without recording a result. Run it again; if this keeps happening, check the worker log.";

const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * Runs one claimed job, then fails it if it is still 'running'. The worker is the only runner,
 * so a job left running after its runner returned (e.g. the runner's own failure record hit a
 * busy database) would otherwise wait for the next worker start. Never throws.
 */
export async function runAndSettle(
  db: Db,
  job: Job,
  run: () => Promise<void>,
  now: () => Date,
): Promise<void> {
  await run();
  try {
    if (!finishJob(db, job.id, "failed", LEFT_RUNNING, now())) return;
    console.warn(`job ${job.id} (${job.kind}) was left running; failed it`);
    addEvent(db, job.id, "error", LEFT_RUNNING, now());
  } catch (error) {
    // The next worker start fails it (recoverRunningJobs).
    console.error(`job ${job.id}: could not record that it was left running: ${describe(error)}`);
  }
}
