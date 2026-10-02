import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { troubleLines } from "@/lib/explain/briefing";
import { buildFacts, FACT_CAPS, type Facts } from "@/lib/explain/voice/facts";
import { localMoment } from "@/lib/format/zoned-time";
import type { BackupHealth } from "@/lib/ops/backup-status";
import type { Product } from "@/lib/products/catalog";
import { attentionFromActions } from "@/lib/today/from-actions";
import { productToday } from "@/lib/today/from-scans";
import { readNotes } from "./read";

const DAY_MS = 24 * 60 * 60_000;

export type GatherDeps = {
  db: Db;
  products: readonly Product[];
  ownerFirstName: string | null;
  timeZone: string;
  /** The brain, for the headlines of recent notes. */
  root: string;
  backup: BackupHealth;
  now: Date;
};

/** Actions finished in the last day, newest first. */
function finishedSince(db: Db, productIds: string[], now: Date): string[] {
  if (productIds.length === 0) return [];
  return db
    .select({ title: actions.title })
    .from(actions)
    .where(
      and(
        inArray(actions.productId, productIds),
        eq(actions.status, "done"),
        gt(actions.statusChangedAt, new Date(now.getTime() - DAY_MS)),
        lte(actions.statusChangedAt, now),
      ),
    )
    .orderBy(desc(actions.statusChangedAt), desc(actions.id))
    .limit(FACT_CAPS.finished)
    .all()
    .map((row) => row.title);
}

/**
 * The facts snapshot for one note, from Harbour's own data: scans, the board, finished work,
 * trouble (worded as the briefing words it) and earlier notes' headlines. A product with no scan
 * has no scores, never the sample Today's placeholders. Worker only.
 */
export function gatherFacts(deps: GatherDeps): Facts {
  const { db, products, now, timeZone } = deps;
  const ids = products.map((p) => p.id);
  const today = products.map((product) => ({ product, ...productToday(db, product.id, now) }));
  const board = attentionFromActions(db, ids, FACT_CAPS.actions);
  return buildFacts({
    local: localMoment(timeZone, now),
    ownerFirstName: deps.ownerFirstName,
    products: today.map(({ product, row, scannedAt }) => ({
      name: product.name,
      scores: row.totals,
      deltas: row.deltas,
      scoredLast24h: scannedAt !== null && now.getTime() - scannedAt.getTime() <= DAY_MS,
    })),
    actions: board.actions.map((a) => ({
      id: Number(a.id),
      title: a.title,
      impact: a.impact,
      effort: a.effort,
      who: a.who,
    })),
    finishedTitles: finishedSince(db, ids, now),
    trouble: troubleLines({
      products,
      failures: today.flatMap((t) => t.failures),
      failedChecks: today.filter((t) => t.row.lastCheckFailed).map((t) => t.product.id),
      backup: deps.backup,
    }),
    recentHeadlines: readNotes(deps.root, timeZone, now, FACT_CAPS.headlines).map(
      (n) => n.note.headline,
    ),
  });
}
