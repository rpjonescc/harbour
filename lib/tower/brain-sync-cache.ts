// Today refreshes every 15-60 s per open tab; git in the brain runs synchronously and would block
// the web process each time. One read serves every render for 30 s, a failure included.

import { readSyncCounts, type SyncRead } from "@/lib/agents/brain-status";

/** How long one git read of the brain is reused. */
export const BRAIN_SYNC_TTL_MS = 30_000;
/** At most this many brain directories are remembered (there is normally one). */
const MAX_ROOTS = 4;

type Entry = { at: number; value: SyncRead };

/** A reader that reuses a read of the same root younger than `ttlMs` by the given clock. */
export function syncReadCache(
  read: (root: string) => SyncRead = readSyncCounts,
  ttlMs = BRAIN_SYNC_TTL_MS,
) {
  const memo = new Map<string, Entry>();
  return (root: string, now: Date): SyncRead => {
    const hit = memo.get(root);
    const age = hit ? now.getTime() - hit.at : Number.POSITIVE_INFINITY;
    // A clock that went backwards reads afresh rather than trusting a read from the future.
    if (hit && age >= 0 && age < ttlMs) return hit.value;
    const value = read(root);
    memo.delete(root);
    memo.set(root, { at: now.getTime(), value });
    for (const oldest of memo.keys()) {
      if (memo.size <= MAX_ROOTS) break;
      memo.delete(oldest);
    }
    return value;
  };
}

const towerCache = syncReadCache();

/** Today's brain reader for a render at `now`, sharing one cache across the web process. */
export const towerSyncRead =
  (now: Date) =>
  (root: string): SyncRead =>
    towerCache(root, now);
