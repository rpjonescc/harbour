// The cost ledger: one row per paid call. DB only, no network; the web reads `spentBetween`.
import { and, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { costs } from "@/lib/db/schema";
import { MICRO_PER_AUD } from "./budget";
import { PAID_SOURCES } from "./paid-sources";

/** Most one row may hold: a single call above A$100 is a unit-price bug, not a real call. */
export const MAX_CALL_MICRO_AUD = 100 * MICRO_PER_AUD;

const PROVIDERS = PAID_SOURCES.map((s) => s.id) as [string, ...string[]];

const entrySchema = z.object({
  provider: z.enum(PROVIDERS),
  collector: z.string().min(1),
  productId: z.string().min(1).nullable(),
  units: z.number().int().min(0),
  amountMicroAud: z.number().int().min(0).max(MAX_CALL_MICRO_AUD),
  jobId: z.number().int().nullable(),
});

export type CostEntry = {
  provider: string;
  collector: string;
  productId: string | null;
  units: number;
  amountMicroAud: number;
  jobId: number | null;
};

/** Writes one paid call; throws (writing nothing) when the entry is not a valid cost. */
export function recordCost(db: Db, entry: CostEntry, now: Date): void {
  const parsed = entrySchema.safeParse(entry);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid cost entry (${problems.join("; ")})`);
  }
  db.insert(costs)
    .values({ ...parsed.data, createdAt: now })
    .run();
}

/** Micro-AUD spent in [start, end). */
export function spentBetween(db: Db, start: Date, end: Date): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${costs.amountMicroAud}), 0)` })
    .from(costs)
    .where(and(gte(costs.createdAt, start), lt(costs.createdAt, end)))
    .get();
  return row?.total ?? 0;
}
