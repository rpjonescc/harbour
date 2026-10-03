// Reads the week's wins. I/O only; lib/tower/wins.ts shapes them.

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Config } from "@/lib/config";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions, scanRuns } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { addDays } from "@/lib/format/iso-day";
import { zonedInstant } from "@/lib/format/zoned-time";
import type { Product } from "@/lib/products/catalog";
import { AREA_KEYS, type AreaKey, weeklyScoreChanges } from "@/lib/scan/views";
import { approvedSince } from "./content-counts";
import { type IndexingReader, indexingReader } from "./indexing-reads";

export type WinsFacts = {
  /** The last 7 local days, oldest first: cards finished each day, and how many had a PR. */
  doneByDay: { day: string; count: number; withPr: number }[];
  rises: { productId: string; area: AreaKey; from: number; to: number }[];
  /** Only where the indexed count is known both now and 7 days ago, and went up. */
  indexedGain: { productId: string; from: number; to: number }[];
  /** Null when content is off or its folder could not be read. */
  approvedPieces: number | null;
};

const DAYS = 7;
const WEEK_MS = DAYS * 24 * 60 * 60_000;
/** Moves to Done in a week: far more than one owner finishes, so the count is never cut short. */
const DONE_LIMIT = 500;

function doneByDay(db: Db, productIds: string[], days: string[], timeZone: string) {
  const first = days[0];
  const rows =
    first === undefined || productIds.length === 0
      ? []
      : db
          .select({ actionId: actionEvents.actionId, at: actionEvents.at, prUrl: actions.prUrl })
          .from(actionEvents)
          .innerJoin(actions, eq(actions.id, actionEvents.actionId))
          .where(
            and(
              eq(actionEvents.to, "done"),
              gte(actionEvents.at, zonedInstant(first, 0, timeZone)),
              inArray(actions.productId, productIds),
            ),
          )
          .orderBy(desc(actionEvents.id))
          .limit(DONE_LIMIT)
          .all();
  return days.map((day) => {
    const cards = new Map<number, boolean>();
    for (const row of rows) {
      if (isoDateIn(timeZone, row.at) === day) cards.set(row.actionId, row.prUrl !== null);
    }
    const withPr = [...cards.values()].filter(Boolean).length;
    return { day, count: cards.size, withPr };
  });
}

/** Google's indexed count from the newest good check at or before `until`; null when unknown. */
function indexedAt(
  db: Db,
  indexing: IndexingReader,
  productId: string,
  until: Date,
): number | null {
  const scan = db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(
      and(
        eq(scanRuns.productId, productId),
        inArray(scanRuns.status, ["ok", "partial"]),
        lte(scanRuns.startedAt, until),
      ),
    )
    .orderBy(desc(scanRuns.id))
    .get();
  if (!scan) return null;
  const state = indexing(scan.id);
  return state.state === "counted" ? state.indexed : null;
}

/**
 * The week's wins: cards finished per local day, score rises against 7 days ago, pages newly in
 * Google, and content approved. `content` is the render's one content read (null when off);
 * `indexing` is the render's scan reader, shared with the product cards.
 */
export function winsFacts(
  db: Db,
  config: Config,
  products: readonly Product[],
  now: Date,
  content: ContentScan | null,
  indexing: IndexingReader = indexingReader(db),
): WinsFacts {
  const timeZone = config.HARBOUR_TIMEZONE;
  const today = isoDateIn(timeZone, now);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)));
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  return {
    doneByDay: doneByDay(
      db,
      products.map((p) => p.id),
      days,
      timeZone,
    ),
    rises: products.flatMap((product) => {
      const weekly = weeklyScoreChanges(db, product.id, product.kind, now);
      return AREA_KEYS.flatMap((area) => {
        const change = weekly[area];
        return change && change.now > change.before
          ? [{ productId: product.id, area, from: change.before, to: change.now }]
          : [];
      });
    }),
    indexedGain: products.flatMap((product) => {
      const from = indexedAt(db, indexing, product.id, weekAgo);
      const to = indexedAt(db, indexing, product.id, now);
      return from !== null && to !== null && to > from ? [{ productId: product.id, from, to }] : [];
    }),
    approvedPieces: content === null ? null : approvedSince(content, days[0] ?? today),
  };
}
