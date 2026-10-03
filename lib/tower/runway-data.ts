// Reads one product's runway card. I/O only; lib/tower/runway.ts shapes it.

import { and, desc, eq } from "drizzle-orm";
import type { ActionRow } from "@/lib/actions/types";
import { topActiveActions } from "@/lib/actions/views";
import type { Config } from "@/lib/config";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions } from "@/lib/db/schema";
import { getTracking, type Product } from "@/lib/products/catalog";
import type { ProductTracking } from "@/lib/products/config";
import { type IndexingState, indexingState } from "@/lib/scan/indexing-view";
import { type OutsideView, outsideView } from "@/lib/scan/outside-view";
import { scanFindings } from "@/lib/scan/product-view";
import {
  type AreaValues,
  scanState,
  type WeeklyChange,
  weeklyScoreChanges,
} from "@/lib/scan/views";
import { type ProductToday, productToday } from "@/lib/today/from-scans";
import { type ContentCounts, contentCounts } from "./content-counts";

export type RunwayFacts = {
  product: Product;
  today: ProductToday;
  nextAction: ActionRow | null;
  weekly: AreaValues<WeeklyChange>;
  /** Null when the last check failed or there is none: the highlight is left out. */
  indexing: IndexingState | null;
  outside: Pick<OutsideView, "state" | "links" | "ai"> | null;
  /** Null when content is off for the product or its folder could not be read. */
  content: ContentCounts | null;
  claudeTouchedAt: Date | null;
};

/** Indexing from the product's last finished check, when it produced something. */
function lastIndexing(db: Db, productId: string): IndexingState | null {
  const last = scanState(db, productId).last;
  if (!last || last.status === "failed") return null;
  const { observations, runs } = scanFindings(db, last.scanId);
  return indexingState(observations, runs);
}

/** When Claude last changed one of the product's cards (an action event by Claude). */
function claudeTouchedAt(db: Db, productId: string): Date | null {
  const row = db
    .select({ at: actionEvents.at })
    .from(actionEvents)
    .innerJoin(actions, eq(actions.id, actionEvents.actionId))
    .where(and(eq(actions.productId, productId), eq(actionEvents.actor, "claude")))
    .orderBy(desc(actionEvents.id))
    .limit(1)
    .get();
  return row?.at ?? null;
}

/**
 * Everything one runway card shows. `contentScan` is the render's one content read, passed only
 * when content is on for this product (else null); `tracking` is its tracked searches and questions.
 */
export function runwayFacts(
  db: Db,
  config: Config,
  product: Product,
  contentScan: ContentScan | null,
  now: Date,
  tracking: ProductTracking | null = getTracking(product.id),
): RunwayFacts {
  const outside = outsideView({ db, config, product, tracking, now });
  return {
    product,
    today: productToday(db, product, now),
    nextAction: topActiveActions(db, [product.id], 1).actions[0] ?? null,
    weekly: weeklyScoreChanges(db, product.id, product.kind, now),
    indexing: lastIndexing(db, product.id),
    outside: { state: outside.state, links: outside.links, ai: outside.ai },
    content: contentScan === null ? null : contentCounts(contentScan, product.id),
    claudeTouchedAt: claudeTouchedAt(db, product.id),
  };
}
