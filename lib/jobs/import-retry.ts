// Re-imports agent output that was committed but not imported (a failed import, or a worker
// that stopped between the commit and the import). Worker only.
import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { git } from "@/lib/agents/git-command";
import { outputForJob } from "@/lib/agents/specs";
import type { Db } from "@/lib/db/client";
import { agentRuns, jobs } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import {
  countImportAttempt,
  importAgentOutput,
  type OutputFile,
  parseAgentOutput,
} from "./agent-output";
import { addEvent, type Job } from "./queue";

/** Import attempts per run, the run's own included. */
export const MAX_IMPORT_ATTEMPTS = 3;
const BATCH = 10;
const RETRY_EVERY_MS = 60_000;

export type ImportRetryDeps = { db: Db; root: string; products: readonly Product[]; now: Date };

/** The output file as committed: the owner's later edits never change what is imported. */
function committedFile(root: string, sha: string, path: string): OutputFile {
  const spec = `${sha}:${path}`;
  return {
    size: Number(git(root, ["cat-file", "-s", spec]).trim()),
    read: () => git(root, ["show", spec]),
  };
}

function pendingRuns(db: Db): { job: Job; sha: string }[] {
  return db
    .select({ job: jobs, sha: agentRuns.commitSha })
    .from(agentRuns)
    .innerJoin(jobs, eq(agentRuns.jobId, jobs.id))
    .where(
      and(
        isNull(agentRuns.importedAt),
        isNotNull(agentRuns.commitSha),
        lt(agentRuns.importAttempts, MAX_IMPORT_ATTEMPTS),
        inArray(jobs.kind, ["discovery", "weekly-analyst"]),
      ),
    )
    .orderBy(asc(agentRuns.jobId))
    .limit(BATCH)
    .all()
    .flatMap(({ job, sha }) => (sha ? [{ job, sha }] : []));
}

/** One attempt for one run; returns whether it imported. Failures are recorded on the job. */
function retryOne(deps: ImportRetryDeps, job: Job, sha: string): boolean {
  const { db, now } = deps;
  let attempt = 0;
  try {
    // Inside the try: a failure to count is recorded like any failed attempt, never thrown.
    attempt = countImportAttempt(db, job.id);
    if (job.kind !== "discovery" && job.kind !== "weekly-analyst") return false;
    const output = outputForJob(job.kind, job.params);
    if (!output) return false;
    const file = committedFile(deps.root, sha, output.path);
    const text = importAgentOutput(db, parseAgentOutput(output, file, deps.products), job, now);
    if (text === null) return false;
    addEvent(db, job.id, "status", `${text} (retried)`, now);
    return true;
  } catch (error) {
    const last = attempt >= MAX_IMPORT_ATTEMPTS ? " — giving up; run the agent again" : "";
    const which = attempt > 0 ? `attempt ${attempt} of ${MAX_IMPORT_ATTEMPTS}` : "attempt";
    const text = `Import ${which} failed: ${(error as Error).message}${last}`;
    console.error(`job ${job.id}: ${text}`);
    addEvent(db, job.id, "error", text, now);
    return false;
  }
}

/** Retries up to 10 pending imports, each at most MAX_IMPORT_ATTEMPTS times; returns how many imported. */
export function retryPendingImports(deps: ImportRetryDeps): number {
  return pendingRuns(deps.db).filter(({ job, sha }) => retryOne(deps, job, sha)).length;
}

/** The worker's import retry: on its first tick, then at most once a minute (between jobs). */
export function makeImportRetry(deps: {
  db: Db;
  root: string;
  products: () => readonly Product[];
  clock: () => number;
  retry?: typeof retryPendingImports;
}) {
  const retry = deps.retry ?? retryPendingImports;
  let lastRun = Number.NEGATIVE_INFINITY;
  return {
    tick(): number {
      const now = deps.clock();
      if (now < lastRun) lastRun = Number.NEGATIVE_INFINITY; // the clock stepped back
      if (now - lastRun < RETRY_EVERY_MS) return 0;
      lastRun = now;
      return retry({ db: deps.db, root: deps.root, products: deps.products(), now: new Date(now) });
    },
  };
}
