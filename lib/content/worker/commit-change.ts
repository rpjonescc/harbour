import { commitChanges, pushBrain } from "@/lib/agents/brain-git";
import type { Db } from "@/lib/db/client";
import { finish } from "@/lib/jobs/git-jobs";
import { addEvent, type Job } from "@/lib/jobs/queue";
import type { Change } from "./decision-types";
import { applyChange } from "./decision-write";

export type CommitDeps = { db: Db; root: string; now: () => Date };

/** The job's own sentences: nothing was saved, or saved here but not pushed yet. */
export type CommitWords = { notSaved: string; notPushed: string };

/**
 * Writes a worker change to the brain and commits only its paths, then pushes. A failed commit
 * puts the files back and fails the job with `notSaved`. On success the caller finishes the job.
 * `already` commits files an interrupted run wrote but never committed, without writing again.
 */
export function commitChange(
  deps: CommitDeps,
  job: Job,
  change: Change,
  words: CommitWords,
  already?: string[],
): { ok: true; pushed: boolean } | { ok: false } {
  const { db, root } = deps;
  const applied = already ? { paths: already, undo: () => undefined } : applyChange(root, change);
  try {
    commitChanges(root, applied.paths, change.message);
  } catch (error) {
    applied.undo();
    console.error(`job ${job.id}: the commit failed (${(error as Error).name})`);
    addEvent(db, job.id, "error", words.notSaved, deps.now());
    finish(db, job.id, "failed", words.notSaved, deps.now());
    return { ok: false };
  }
  addEvent(db, job.id, "status", `Committed ${applied.paths.length} file(s)`, deps.now());
  const push = pushBrain(root);
  if (!push.ok) addEvent(db, job.id, "error", words.notPushed, deps.now());
  return { ok: true, pushed: push.ok };
}
