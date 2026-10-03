import { dirname, join } from "node:path";
import { recoveryStatus } from "@/lib/jobs/run-marker";
import { assertBrainRepoRoot, ownerChanges, unpushedCount } from "./brain-git";

/** `unpushed` is null when it could not be counted (no upstream branch, or git failed). */
export type BrainSyncCounts = { unsaved: number; unpushed: number | null };
export type BrainSyncStatus = {
  /** Null when git must not run in the brain (missing, or not its own repository root). */
  sync: BrainSyncCounts | null;
  /** `pending` is null when the interrupted-run records could not be read. */
  recovery: { pending: string[] | null; lastError: string | null };
};

/** Where discarded agent changes are kept: next to the database, outside the brain. */
export function quarantineRootFor(dbPath: string): string {
  return join(dirname(dbPath), "quarantine");
}

function syncCounts(root: string): BrainSyncCounts | null {
  try {
    assertBrainRepoRoot(root);
  } catch {
    // Expected: the brain is missing or not its own repository; the worker reports that.
    return null;
  }
  try {
    return { unsaved: ownerChanges(root).length, unpushed: unpushedCount(root) };
  } catch (error) {
    console.error("brain sync status unavailable:", (error as Error).message);
    return null;
  }
}

/** Unsaved notes, unpushed commits and interrupted-run recovery, for the sync banners. */
export function brainSyncStatus(root: string, quarantineRoot: string): BrainSyncStatus {
  return { sync: syncCounts(root), recovery: recoveryStatus(quarantineRoot) };
}
