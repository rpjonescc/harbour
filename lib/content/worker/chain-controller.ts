import { desc, eq, inArray } from "drizzle-orm";
import { chainNext } from "@/lib/content/chain";
import { ideaIdSchema, productIdSchema } from "@/lib/content/ids";
import { enqueueContentIn } from "@/lib/content/limits";
import { contentPaths } from "@/lib/content/paths";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { addEvent, type Job } from "@/lib/jobs/queue";
import type { AfterOk, JobTx } from "@/lib/jobs/run-job";
import { chainView } from "./chain-pieces";
import { readIdeaFile } from "./draft";

export type ChainDeps = {
  db: Db;
  root: string;
  timeZone: string;
  dailyRuns: number;
  now: () => Date;
};
type Next = { kind: "content-atomise" | "content-gate"; params: Record<string, string> };

const CHAIN_KINDS = ["content-draft", "content-atomise", "content-gate"] as const;
const PRODUCT_OF = /^([a-z0-9-]{1,40}?)-\d{8}-/;
/** How many recent chain jobs a restart looks at, so the look is bounded however long the history. */
const RESUME_LOOK = 300;

/** The idea's own state, from its file; a file that cannot be read is an error, never a guess. */
function ideaState(root: string, ideaId: string): string | null {
  const productId = productIdSchema.safeParse(PRODUCT_OF.exec(ideaId)?.[1]);
  if (!productId.success) return null;
  return readIdeaFile(root, contentPaths.idea(productId.data, ideaId)).idea.state;
}

/**
 * A gate step that already ran to the end once is never queued again by the chain: if the
 * pieces still ask for it, something is wrong, and one more run would only repeat it. This is the
 * chain's last bound; the revision rules are the first.
 */
function ranBefore(db: Db, next: Next): boolean {
  if (next.kind !== "content-gate") return false;
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.kind, "content-gate"))
    .orderBy(desc(jobs.id))
    .limit(RESUME_LOOK)
    .all()
    .some(
      (j) =>
        j.status === "ok" &&
        j.params.ideaId === next.params.ideaId &&
        j.params.gate === next.params.gate &&
        j.params.attempt === next.params.attempt,
    );
}

const sameParams = (a: Record<string, string>, b: Record<string, string>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** The step that follows a finished content job, or null when the chain has nothing more to do. */
function nextStep(root: string, job: Job): Next | null {
  const id = ideaIdSchema.safeParse(job.params.ideaId);
  if (!id.success) return null;
  const ideaId = id.data;
  switch (job.kind) {
    case "content-draft":
      // A draft that stopped at the number check leaves the idea in `idea`: nothing more to do.
      return ideaState(root, ideaId) === "drafting"
        ? { kind: "content-atomise", params: { ideaId } }
        : null;
    case "content-atomise":
    case "content-gate": {
      const step = chainNext(chainView(root, ideaId).chain);
      if (!step) return null;
      return {
        kind: "content-gate",
        params: { ideaId, gate: step.gate, attempt: String(step.attempt) },
      };
    }
    default:
      return null; // digests, ideas and decisions have no chain; an unknown kind queues nothing
  }
}

/**
 * What to do for a finished job: read the pieces now, queue inside the caller's transaction.
 * Chained steps are exempt from the daily cap so an idea is never left half done (spec §12.2).
 */
function plan(deps: ChainDeps, job: Job): ((tx: JobTx) => string | null) | null {
  const next = nextStep(deps.root, job);
  if (!next) return null;
  // The job that just ran is never repeated by the chain: it would be a duplicate attempt.
  if (next.kind === job.kind && sameParams(next.params, job.params)) {
    return () => "The next step was the one that just ran, so Harbour queued nothing more.";
  }
  if (ranBefore(deps.db, next))
    return () => "The next check already ran, so Harbour queued nothing more.";
  return (tx) => {
    const queued = enqueueContentIn(tx, {
      kind: next.kind,
      params: next.params,
      requestedBy: null,
      timeZone: deps.timeZone,
      now: deps.now(),
      dailyRuns: deps.dailyRuns,
      chained: true,
    });
    if (!queued.ok) return "Harbour couldn't queue the next step.";
    return queued.created ? `Queued the next step (job ${queued.id})` : null;
  };
}

/** The worker's hook: the next step is queued in the transaction that finishes the job. */
export const chainHook =
  (deps: ChainDeps): AfterOk =>
  (job) =>
    plan(deps, job);

/**
 * After a content job: when it succeeded, queue the next step of the idea's chain. A failed or
 * cancelled job queues nothing: the Content page shows it and offers "Try again". Safe to call
 * twice; an identical queued or running step is never queued again.
 */
export function afterContentJob(deps: ChainDeps, job: Job): boolean {
  if (job.status !== "ok") return false;
  const queue = plan(deps, job);
  if (!queue) return false;
  const note = deps.db.transaction((tx) => queue(tx), { behavior: "immediate" });
  if (note) addEvent(deps.db, job.id, "status", note, deps.now());
  return note?.startsWith("Queued") ?? false;
}

/**
 * Picks chains up after a restart: for each idea whose newest chain job finished well and which
 * has no step queued or running, queues the step that should follow. A chain whose newest job
 * failed stays stopped. Looks at a bounded number of recent jobs; returns how many it queued.
 */
export function resumeChains(deps: ChainDeps): number {
  const recent = deps.db
    .select()
    .from(jobs)
    .where(inArray(jobs.kind, [...CHAIN_KINDS]))
    .orderBy(desc(jobs.id))
    .limit(RESUME_LOOK)
    .all();
  const newest = new Map<string, Job>();
  for (const job of recent) {
    const ideaId = job.params.ideaId;
    if (ideaId !== undefined && !newest.has(ideaId)) newest.set(ideaId, job);
  }
  let queued = 0;
  for (const job of newest.values()) {
    try {
      if (afterContentJob(deps, job)) queued += 1;
    } catch (error) {
      // One idea whose files cannot be read must not stop the others; its job keeps its record.
      // Only the error's kind is logged: its message could carry a path or a piece's own words.
      console.error(`job ${job.id}: resuming its chain failed (${(error as Error).name})`);
      addEvent(
        deps.db,
        job.id,
        "error",
        "Harbour couldn't work out the next step after a restart.",
        deps.now(),
      );
    }
  }
  return queued;
}
