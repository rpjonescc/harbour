import type { BrainSyncStatus } from "@/lib/agents/brain-status";
import { BrainSyncBanner } from "./BrainSyncBanner";
import { RecoveryBanner } from "./RecoveryBanner";

/**
 * Recovery warning (if any) and the save/sync line, from a precomputed status. `quietWhenSynced`
 * drops the all-clear line on a page whose verdict already says it.
 */
export function BrainStatus({
  status,
  quietWhenSynced = false,
}: {
  status: BrainSyncStatus;
  quietWhenSynced?: boolean;
}) {
  const { sync, recovery } = status;
  return (
    <>
      <RecoveryBanner pending={recovery.pending} lastError={recovery.lastError} />
      {sync && (
        <BrainSyncBanner
          unsaved={sync.unsaved}
          unpushed={sync.unpushed}
          paused={recovery.pending === null || recovery.pending.length > 0}
          quietWhenSynced={quietWhenSynced}
        />
      )}
    </>
  );
}
