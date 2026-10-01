import { lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertBrainRepoRoot, ownerChanges, unpushedCount } from "@/lib/agents/brain-git";
import { checkBrainRoot } from "@/lib/brain/docs";
import { pendingRecovery } from "./run-marker";

export type HousekeepingAction = "notes-sync" | "brain-push";

// The last problem logged, so a persistent one is reported once rather than every check.
let lastWarning: string | null = null;

function warnOnce(message: string): void {
  if (message === lastWarning) return;
  lastWarning = message;
  console.warn(`housekeeping: ${message}`);
}

/**
 * Modification time of a changed path. A deleted path has none, so it takes the time of its
 * nearest surviving folder (deleting a file updates its folder), or `now` if even that fails.
 */
function changedAt(root: string, path: string, now: Date): number {
  for (let p = path; ; p = dirname(p)) {
    try {
      return lstatSync(join(root, p)).mtimeMs;
    } catch {
      if (p === "." || p === "") return now.getTime();
    }
  }
}

/**
 * What the worker should do between jobs: save the owner's edits once they have been quiet for
 * `quietMs`, otherwise push unpushed commits when a retry is due. Does nothing while an
 * interrupted agent run awaits recovery. Never throws.
 */
export function housekeepingAction(
  root: string,
  now: Date,
  opts: { quietMs: number; pushRetryDue: boolean; quarantineRoot: string },
): HousekeepingAction | null {
  try {
    // An interrupted run's changes may still be in the brain: never save them as owner notes.
    if (pendingRecovery(opts.quarantineRoot).length > 0) return null;
    const status = checkBrainRoot(root);
    if (!status.ok) {
      warnOnce(`brain directory ${status.reason}: ${root}`);
      return null;
    }
    // Never autosave into a repository that merely contains the brain directory.
    try {
      assertBrainRepoRoot(root);
    } catch (error) {
      warnOnce((error as Error).message);
      return null;
    }
    const changes = ownerChanges(root);
    lastWarning = null;
    if (changes.length > 0) {
      const newest = changes.reduce((max, c) => Math.max(max, changedAt(root, c.path, now)), 0);
      return now.getTime() - newest >= opts.quietMs ? "notes-sync" : null;
    }
    if (opts.pushRetryDue && (unpushedCount(root) ?? 0) > 0) return "brain-push";
    return null;
  } catch (error) {
    warnOnce(`git failed: ${(error as Error).message.split("\n")[0]}`);
    return null;
  }
}
