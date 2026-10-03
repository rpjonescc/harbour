// Reads what "Needs you" draws on. I/O only; lib/tower/needs.ts shapes it.

import { and, count, eq, inArray, min } from "drizzle-orm";
import { approvalsWaiting } from "@/lib/actions/board-notices";
import type { Named } from "@/lib/agents/view";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import type { Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { contentCounts } from "./content-counts";
import { failedUnretried } from "./jobs-data";

export type NeedsFacts = {
  suggested: { count: number; oldest: Date | null };
  /** Null when content is off or its folder could not be read: left out, never zeros. */
  content: { needsYou: number; ready: number } | null;
  approvals: { productId: string; productName: string; count: number }[];
  failedRuns: Job[];
  /** Names for the failed runs' labels. */
  products: Named[];
};

/** New ideas (suggested actions) for configured products: how many, and since when. */
function suggested(db: Db, productIds: string[]): NeedsFacts["suggested"] {
  if (productIds.length === 0) return { count: 0, oldest: null };
  const row = db
    .select({ n: count(), oldest: min(actions.statusChangedAt) })
    .from(actions)
    .where(and(eq(actions.status, "suggested"), inArray(actions.productId, productIds)))
    .get();
  return { count: row?.n ?? 0, oldest: row?.oldest ?? null };
}

/**
 * Everything Needs you can list, with bounded queries. `content` is the render's one content
 * read (towerContentScan), shared with the runway cards; null when content is off.
 */
export function needsFacts(
  db: Db,
  products: readonly Product[],
  now: Date,
  content: ContentScan | null,
): NeedsFacts {
  const counts = content === null ? null : contentCounts(content);
  return {
    suggested: suggested(
      db,
      products.map((p) => p.id),
    ),
    content: counts === null ? null : { needsYou: counts.needsYou, ready: counts.ready },
    approvals: approvalsWaiting(db, products),
    failedRuns: failedUnretried(db, now),
    products: products.map(({ id, name }) => ({ id, name })),
  };
}
