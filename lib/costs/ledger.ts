// Reading the cost ledger. Web-safe (Today reads it); writes live in ledger-write.ts (worker only).
import { and, asc, eq, gte, lt, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { costs } from "@/lib/db/schema";

function sumBetween(db: Db, start: Date, end: Date, extra?: SQL): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${costs.amountMicroAud}), 0)` })
    .from(costs)
    .where(and(gte(costs.createdAt, start), lt(costs.createdAt, end), extra))
    .get();
  return row?.total ?? 0;
}

/**
 * Micro-AUD spent in [start, end): recorded calls plus reservations (a call in flight, or one a
 * crash cut short, may have been billed, so its estimate counts until it is settled).
 */
export function spentBetween(db: Db, start: Date, end: Date): number {
  return sumBetween(db, start, end);
}

/** `spentBetween` for one collector's calls (e.g. "treg"). */
export function collectorSpentBetween(db: Db, collector: string, start: Date, end: Date): number {
  return sumBetween(db, start, end, eq(costs.collector, collector));
}

/** The part of `spentBetween` that is still only a reservation (estimate, not confirmed). */
export function unconfirmedBetween(db: Db, start: Date, end: Date): number {
  return sumBetween(db, start, end, eq(costs.status, "reserved"));
}

export type Reservation = {
  id: number;
  createdAt: Date;
  collector: string;
  productId: string | null;
  jobId: number | null;
  amountMicroAud: number;
};

/** Reservations in [start, end), oldest first: calls in flight, or estimates a crash left behind. */
export function reservationsBetween(db: Db, start: Date, end: Date): Reservation[] {
  return db
    .select({
      id: costs.id,
      createdAt: costs.createdAt,
      collector: costs.collector,
      productId: costs.productId,
      jobId: costs.jobId,
      amountMicroAud: costs.amountMicroAud,
    })
    .from(costs)
    .where(and(gte(costs.createdAt, start), lt(costs.createdAt, end), eq(costs.status, "reserved")))
    .orderBy(asc(costs.id))
    .all();
}
