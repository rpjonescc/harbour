import {
  assertBrainRepoRoot,
  commitChanges,
  ownerChanges,
  pushBrain,
} from "@/lib/agents/brain-git";
import type { Db } from "@/lib/db/client";
import { addEvent, finishJob, type Job } from "./queue";
import { pendingRecovery } from "./run-marker";

export type GitJobDeps = { db: Db; root: string; quarantineRoot: string; now: () => Date };

/** Finishes a running job; warns when another path (e.g. recovery) already finished it. */
export function finish(
  db: Pick<Db, "update">,
  id: number,
  status: "ok" | "failed" | "cancelled",
  error: string | null,
  now: Date,
  result: string | null = null,
): boolean {
  const done = finishJob(db, id, status, error, now, result);
  if (!done) {
    console.warn(`job ${id} was no longer running; its result (${status}) was not recorded`);
  }
  return done;
}

/** Why git must not run in `root` (not its own repository root), or null when it may. */
export function brainRootError(root: string): string | null {
  try {
    assertBrainRepoRoot(root);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** Why brain writes must wait: an interrupted agent run's changes are not recovered yet. */
export function recoveryBlock(quarantineRoot: string): string | null {
  let pending: string[];
  try {
    pending = pendingRecovery(quarantineRoot);
  } catch (error) {
    return `${(error as Error).message}, so nothing was written. Check that Harbour can read the quarantine folder next to its database, then run it again.`;
  }
  if (pending.length === 0) return null;
  return `A previous run's changes are still being recovered (job ${pending.join(", ")}) — this resumes automatically once they are in quarantine`;
}

/** Commits the owner's own uncommitted edits so they are never mixed with agent work. */
export function saveOwnerNotes(root: string): number {
  const changes = ownerChanges(root);
  if (changes.length > 0) {
    commitChanges(
      root,
      changes.map((c) => c.path),
      `notes: owner update (${changes.length} file(s))`,
    );
  }
  return changes.length;
}

/**
 * Saves the owner's own edits (autosave, or "Save now"): commits every uncommitted change in
 * the brain and pushes. Runs in the worker, so it never overlaps an agent's git work.
 * `committed` is false only when the commit step could not run or failed.
 */
export function runNotesSyncJob(
  deps: GitJobDeps,
  job: Job,
): { committed: boolean; pushed: boolean } {
  const fail = (message: string) => {
    addEvent(deps.db, job.id, "error", message, deps.now());
    finish(deps.db, job.id, "failed", message, deps.now());
    return { committed: false, pushed: false };
  };
  const blocked = brainRootError(deps.root) ?? recoveryBlock(deps.quarantineRoot);
  if (blocked) return fail(blocked);
  let saved: number;
  try {
    saved = saveOwnerNotes(deps.root);
  } catch (error) {
    return fail(`Could not commit notes: ${(error as Error).message}`);
  }
  const text = saved > 0 ? `Saved ${saved} file(s)` : "Nothing to save";
  addEvent(deps.db, job.id, "status", text, deps.now());
  return { committed: true, pushed: runPushJob(deps, job) };
}

/** Pushes local brain commits (automatic retry, or "Retry now"). Returns whether it pushed. */
export function runPushJob(deps: Omit<GitJobDeps, "quarantineRoot">, job: Job): boolean {
  const refused = brainRootError(deps.root);
  const push = refused ? { ok: false as const, error: refused } : pushBrain(deps.root);
  if (push.ok) {
    addEvent(deps.db, job.id, "status", "Pushed to the brain repository", deps.now());
    finish(deps.db, job.id, "ok", null, deps.now());
  } else {
    addEvent(deps.db, job.id, "error", push.error, deps.now());
    finish(deps.db, job.id, "failed", `Push failed: ${push.error}`, deps.now());
  }
  return push.ok;
}
