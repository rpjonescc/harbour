import { dirname, join } from "node:path";
import { recoveryStatus } from "@/lib/jobs/run-marker";
import { assertBrainRepoRoot, ownerChanges, unpushedCount } from "./brain-git";

export type BrainSyncCounts = { unsaved: number; unpushed: number };
export type BrainSyncStatus = {
  /** Null when git must not run in the brain (missing, or not its own repository root). */
  sync: BrainSyncCounts | null;
  recovery: { pending: string[]; lastError: string | null };
};

/** Where discarded agent changes are kept: next to the database, outside the brain. */
export function quarantineRootFor(dbPath: string): string {
  return join(dirname(dbPath), "quarantine");
}

function syncCounts(root: string): BrainSyncCounts | null {
  try {
    assertBrainRepoRoot(root);
    return { unsaved: ownerChanges(root).length, unpushed: unpushedCount(root) ?? 0 };
  } catch {
    // An unusable brain is reported elsewhere; the sync banner just stays hidden.
    return null;
  }
}

/** Unsaved notes, unpushed commits and interrupted-run recovery, for the sync banners. */
export function brainSyncStatus(root: string, quarantineRoot: string): BrainSyncStatus {
  return { sync: syncCounts(root), recovery: recoveryStatus(quarantineRoot) };
}
