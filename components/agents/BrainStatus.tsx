import type { BrainSyncStatus } from "@/lib/agents/brain-status";
import { BrainSyncBanner } from "./BrainSyncBanner";
import { RecoveryBanner } from "./RecoveryBanner";

/** Recovery warning (if any) and the save/sync line, from a precomputed status. */
export function BrainStatus({ status }: { status: BrainSyncStatus }) {
  const { sync, recovery } = status;
  return (
    <>
      <RecoveryBanner pending={recovery.pending} lastError={recovery.lastError} />
      {sync && (
        <BrainSyncBanner
          unsaved={sync.unsaved}
          unpushed={sync.unpushed}
          paused={recovery.pending.length > 0}
        />
      )}
    </>
  );
}
