// Writing the cost ledger: reservations and recorded calls. Worker only.
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { costs } from "@/lib/db/schema";
import { canSpend, MAX_CALL_MICRO_AUD } from "./budget";
import { spentBetween } from "./ledger";
import { PAID_SOURCES } from "./paid-sources";

const PROVIDERS = PAID_SOURCES.map((s) => s.id) as [string, ...string[]];

const callSchema = z.object({
  provider: z.enum(PROVIDERS),
  units: z.number().int().min(0),
  amountMicroAud: z.number().int().min(0).max(MAX_CALL_MICRO_AUD),
});

const entrySchema = callSchema.extend({
  collector: z.string().min(1),
  productId: z.string().min(1).nullable(),
  jobId: z.number().int().nullable(),
});

/** What a paid call cost, as its collector reports it. */
export type PaidCall = { provider: string; units: number; amountMicroAud: number };

export type CostEntry = PaidCall & {
  collector: string;
  productId: string | null;
  jobId: number | null;
};

type Who = { collector: string; productId: string | null; jobId: number | null };

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid cost entry (${problems.join("; ")})`);
}

/** Writes one recorded paid call; throws (writing nothing) when the entry is not a valid cost. */
export function recordCost(db: Db, entry: CostEntry, now: Date): void {
  const valid = parse(entrySchema, entry);
  db.insert(costs)
    .values({ ...valid, status: "recorded", createdAt: now })
    .run();
}

/**
 * Reserves `amountMicroAud` when it fits the cap on top of everything in `window` (reserved rows
 * included); returns the reservation's id, or null. Check and insert share one IMMEDIATE
 * transaction, so no other writer can slip a reservation in between.
 */
export function reserveCost(
  db: Db,
  input: Who & { amountMicroAud: number; capMicroAud: number; window: { start: Date; end: Date } },
  now: Date,
): number | null {
  const { amountMicroAud, capMicroAud, window, collector, productId, jobId } = input;
  return db.transaction(
    (tx) => {
      const spent = spentBetween(tx, window.start, window.end);
      if (!canSpend(spent, capMicroAud, amountMicroAud)) return null;
      const row = tx
        .insert(costs)
        .values({
          createdAt: now,
          status: "reserved",
          provider: null,
          collector,
          productId,
          units: 0,
          amountMicroAud,
          jobId,
        })
        .returning({ id: costs.id })
        .get();
      return row.id;
    },
    { behavior: "immediate" },
  );
}

/**
 * Turns reservation `id` into the recorded call at its actual price; false when it is no longer
 * reserved. It keeps the reservation's time: the call is charged to the month it was allowed in.
 * Throws (changing nothing) when the call is not a valid cost.
 */
export function settleCost(db: Db, id: number, call: PaidCall): boolean {
  const valid = parse(callSchema, call);
  const settled = db
    .update(costs)
    .set({ ...valid, status: "recorded" })
    .where(and(eq(costs.id, id), eq(costs.status, "reserved")))
    .run();
  return settled.changes === 1;
}

/** Deletes those of `ids` that are still reservations (estimates for calls never made). */
export function dropReservations(db: Db, ids: readonly number[]): void {
  if (ids.length === 0) return;
  db.delete(costs)
    .where(and(inArray(costs.id, [...ids]), eq(costs.status, "reserved")))
    .run();
}
