// Reads the last day's activity for the tower's feed. I/O only; lib/tower/activity.ts shapes it.

import { and, desc, eq, gte, inArray, isNotNull, ne, not, or, sql } from "drizzle-orm";
import type { ActionActor, ActionStage } from "@/lib/actions/types";
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions, jobs } from "@/lib/db/schema";
import type { Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { AREA_KEYS, type AreaKey, productScoreTrend } from "@/lib/scan/views";
import { scheduleRows } from "@/lib/settings/view";
import { JOB_LIMIT } from "./jobs-data";

const DAY_MS = 24 * 60 * 60_000;
/** Saving and pushing notes run every few minutes: only their failures are news. */
const HOUSEKEEPING = ["notes-sync", "brain-push"] as const;

export type CardMove = {
  actionId: number;
  title: string;
  productId: string;
  actor: ActionActor;
  toStatus: string;
  toStage: ActionStage | null;
  at: Date;
};

export type ScoreRise = { productId: string; area: AreaKey; from: number; to: number; at: Date };

export type ActivityFacts = {
  running: Job[];
  queued: Job[];
  /** Finished in the last 24 hours, newest first, at most 50. */
  finished: Job[];
  /** Card moves in the last 24 hours, newest first, at most 50. */
  moves: CardMove[];
  scoreRises: ScoreRise[];
  /** The next scheduled run of any kind; null when every schedule is off. */
  nextRun: Date | null;
};

const jobsIn = (db: Db, status: "queued" | "running") =>
  db.select().from(jobs).where(eq(jobs.status, status)).orderBy(jobs.id).limit(JOB_LIMIT).all();

function finishedSince(db: Db, since: Date): Job[] {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["ok", "failed"]),
        gte(jobs.finishedAt, since),
        or(eq(jobs.status, "failed"), not(inArray(jobs.kind, [...HOUSEKEEPING]))),
      ),
    )
    .orderBy(desc(jobs.finishedAt), desc(jobs.id))
    .limit(JOB_LIMIT)
    .all();
}

function movesSince(db: Db, since: Date, productIds: string[]): CardMove[] {
  if (productIds.length === 0) return [];
  return db
    .select({
      actionId: actionEvents.actionId,
      title: actions.title,
      productId: actions.productId,
      actor: actionEvents.actor,
      toStatus: actionEvents.to,
      toStage: actionEvents.toStage,
      at: actionEvents.at,
    })
    .from(actionEvents)
    .innerJoin(actions, eq(actions.id, actionEvents.actionId))
    .where(
      and(
        gte(actionEvents.at, since),
        isNotNull(actionEvents.from), // creation is not a move
        // Nor is an entry that kept the status and stage (a note, a link that moved nothing).
        or(
          ne(actionEvents.from, actionEvents.to),
          sql`${actionEvents.fromStage} IS NOT ${actionEvents.toStage}`,
        ),
        inArray(actions.productId, productIds),
      ),
    )
    .orderBy(desc(actionEvents.id))
    .limit(JOB_LIMIT)
    .all();
}

/** Areas whose newest score, from a check in the window, rose against the check before. */
function risesSince(db: Db, products: readonly Product[], since: Date, now: Date): ScoreRise[] {
  return products.flatMap((product) => {
    const { latest, deltas } = productScoreTrend(db, product.id, product.kind, now);
    if (!latest || latest.computedAt.getTime() < since.getTime()) return [];
    return AREA_KEYS.flatMap((area) => {
      const to = latest.totals[area];
      const delta = deltas[area];
      if (to === null || delta === null || delta <= 0) return [];
      return [{ productId: product.id, area, from: to - delta, to, at: latest.computedAt }];
    });
  });
}

/** Everything the feed shows from the last 24 hours, every list bounded. */
export function activityFacts(
  db: Db,
  products: readonly Product[],
  config: Config,
  now: Date,
): ActivityFacts {
  const since = new Date(now.getTime() - DAY_MS);
  const tokenSet = Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN);
  const next = scheduleRows(config, now, tokenSet).flatMap((row) =>
    row.enabled && row.next ? [row.next.getTime()] : [],
  );
  return {
    running: jobsIn(db, "running"),
    queued: jobsIn(db, "queued"),
    finished: finishedSince(db, since),
    moves: movesSince(
      db,
      since,
      products.map((p) => p.id),
    ),
    scoreRises: risesSince(db, products, since, now),
    nextRun: next.length > 0 ? new Date(Math.min(...next)) : null,
  };
}
