// Today reads Google's indexed count from a scan in two tiles (the product cards and the week's
// wins), often from the same scan. One reader per render reads each scan once, and only what the
// indexing collector stored, not every observation of the scan.

import type { Db } from "@/lib/db/client";
import { type IndexingState, indexingState } from "@/lib/scan/indexing-view";
import { collectorObservations } from "@/lib/scan/store";
import { scanCollectorRuns } from "@/lib/scan/views";

/** A scan's indexing state by scan id. */
export type IndexingReader = (scanId: number) => IndexingState;

/** A reader for one render: each scan is read at most once; nothing outlives the render. */
export function indexingReader(db: Db): IndexingReader {
  const memo = new Map<number, IndexingState>();
  return (scanId) => {
    const hit = memo.get(scanId);
    if (hit) return hit;
    const observations = collectorObservations(db, scanId, "indexing").map((row) => ({
      ...row,
      collector: "indexing",
    }));
    const state = indexingState(observations, scanCollectorRuns(db, scanId));
    memo.set(scanId, state);
    return state;
  };
}
