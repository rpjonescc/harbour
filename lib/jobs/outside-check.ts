import { and, eq, gte } from "drizzle-orm";
import type { Config } from "@/lib/config";
import { audToMicro } from "@/lib/costs/budget";
import { budgetSkipReason } from "@/lib/costs/budget-skip";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import type { OutsideRefusal } from "@/lib/explain/outside-check";
import { localTime, zonedInstant } from "@/lib/format/zoned-time";
import type { ProductTracking } from "@/lib/products/config";
import { enqueueJobIn, findActiveJob, type JobWriter } from "./queue";

/** A product's manual outside-view checks: one per 6 hours and 3 per local day. */
export const OUTSIDE_CHECK_LIMITS = { gapMs: 6 * 60 * 60_000, perDay: 3 } as const;

export type OutsideCheckInput = {
  db: Db;
  config: Config;
  now: Date;
  login: string;
  productId: string;
  /** What the owner chose to track for the product; null when nothing. */
  tracking: ProductTracking | null;
};

export type OutsideCheckResult =
  | { ok: true; id: number; created: boolean }
  | { ok: false; reason: OutsideRefusal };

const chosen = (t: ProductTracking | null) =>
  t !== null && t.queries.length + t.questions.length > 0;

/** The outside-check job for a product that is queued or running, if any. */
export function activeOutsideCheck(db: JobWriter, productId: string): number | null {
  return findActiveJob(db, "outside-check", { productId });
}

/**
 * Why a new check of the product can't be queued, or null when it can: nothing chosen, no key, no
 * budget, a check in the last 6 hours or 3 already today. A check already queued is not asked
 * about here (callers return it first).
 */
export function outsideCheckRefusal(
  db: Db,
  config: Config,
  now: Date,
  productId: string,
  tracking: ProductTracking | null,
): OutsideRefusal | null {
  if (!chosen(tracking)) return "no_searches";
  if (!config.HARBOUR_TREG_API_KEY) return "key_missing";
  const cap = audToMicro(config.HARBOUR_MONTHLY_BUDGET_AUD);
  if (budgetSkipReason(db, cap, config.HARBOUR_TIMEZONE, now) !== null) return "budget_used_up";
  const dayStart = startOfLocalDay(config.HARBOUR_TIMEZONE, now);
  const gate = new Date(now.getTime() - OUTSIDE_CHECK_LIMITS.gapMs);
  const since = dayStart < gate ? dayStart : gate;
  const mine = db
    .select({ createdAt: jobs.createdAt, params: jobs.params })
    .from(jobs)
    .where(and(eq(jobs.kind, "outside-check"), gte(jobs.createdAt, since)))
    .all()
    .filter((job) => job.params.productId === productId);
  if (mine.some((job) => job.createdAt > gate)) return "too_soon";
  const today = mine.filter((job) => job.createdAt >= dayStart);
  return today.length >= OUTSIDE_CHECK_LIMITS.perDay ? "daily_cap" : null;
}

/**
 * Queues an outside-view check of one product. A check already queued or running is returned
 * first (a second click is not an error); only then do the settings, the budget and the limits
 * decide. The check and the insert share one transaction, so two clicks cannot both pass.
 */
export function requestOutsideCheck(input: OutsideCheckInput): OutsideCheckResult {
  const { db, config, now, productId, tracking } = input;
  const params = { productId };
  return db.transaction(
    (tx) => {
      const active = activeOutsideCheck(tx, productId);
      if (active !== null) return { ok: true, id: active, created: false };
      const reason = outsideCheckRefusal(db, config, now, productId, tracking);
      if (reason !== null) return { ok: false, reason };
      return { ok: true, ...enqueueJobIn(tx, "outside-check", params, input.login, now) };
    },
    { behavior: "immediate" },
  );
}

const startOfLocalDay = (timeZone: string, now: Date) =>
  zonedInstant(localTime(timeZone, now).day, 0, timeZone);
