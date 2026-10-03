import { dirname, join } from "node:path";
import { recoveryStatus } from "@/lib/jobs/run-marker";
import { assertBrainRepoRoot, ownerChanges, unpushedCount } from "./brain-git";

/** `unpushed` is null when it could not be counted (no upstream branch, or git failed). */
export type BrainSyncCounts = { unsaved: number; unpushed: number | null };
export type BrainSyncStatus = {
  /** Null when git must not run in the brain (missing, not its own repository root, or a run is active). */
  sync: BrainSyncCounts | null;
  /** Git ran and failed, so whether notes are saved could not be checked (never read as saved). */
  syncFailed: boolean;
  /** `pending` is null when the interrupted-run records could not be read. */
  recovery: { pending: string[] | null; lastError: string | null };
};

/** Where discarded agent changes are kept: next to the database, outside the brain. */
export function quarantineRootFor(dbPath: string): string {
  return join(dirname(dbPath), "quarantine");
}

/** One git read of the brain: its counts, `skipped` (missing or not its own repository) or `failed`. */
export type SyncRead = BrainSyncCounts | "skipped" | "failed";

/** Counts unsaved files and unpushed commits with git; a failure is logged and reported. */
export function readSyncCounts(root: string): SyncRead {
  try {
    assertBrainRepoRoot(root);
  } catch {
    // Expected: the brain is missing or not its own repository; the worker reports that.
    return "skipped";
  }
  try {
    return { unsaved: ownerChanges(root).length, unpushed: unpushedCount(root) };
  } catch (error) {
    console.error("brain sync status unavailable:", (error as Error).message);
    return "failed";
  }
}

/**
 * Unsaved notes, unpushed commits and interrupted-run recovery, for the sync banners. While a run
 * marker is in place (an agent run is active or awaits recovery) no git runs here: the agent may
 * have changed the brain's git metadata, which only the worker's checks may meet. `read` lets
 * Today reuse a recent read instead of running git on every refresh.
 */
export function brainSyncStatus(
  root: string,
  quarantineRoot: string,
  read: (root: string) => SyncRead = readSyncCounts,
): BrainSyncStatus {
  const recovery = recoveryStatus(quarantineRoot);
  const runActive = recovery.pending === null || recovery.pending.length > 0;
  if (runActive) return { sync: null, syncFailed: false, recovery };
  const counts = read(root);
  return {
    sync: typeof counts === "string" ? null : counts,
    syncFailed: counts === "failed",
    recovery,
  };
}
