// The budget guard and cost recording a scan hands its collectors. Worker only.
import type { Db } from "@/lib/db/client";
import { monthWindow } from "@/lib/format/zoned-time";
import type { CollectContext } from "@/lib/scan/types";
import { budgetLevel, formatAud, formatAudPrecise, MAX_CALL_MICRO_AUD } from "./budget";
import { spentBetween } from "./ledger";
import {
  dropReservations,
  type PaidCall,
  recordCost,
  reserveCost,
  settleCost,
} from "./ledger-write";

/** What a collector spends through, plus the runner's side: settle up and check for a lost cost. */
export type Spend = Pick<CollectContext, "cost" | "budget"> & {
  /**
   * Called once the collector's run ends; no call is allowed after it. When the collector
   * returned a result, its unrecorded reservations are dropped (it made no such call). When it
   * threw or was abandoned (timeout, cancel), they stay counted: a call may have been sent and
   * billed, or still be in flight, and a late record settles it.
   */
  release(ended: "returned" | "threw"): void;
  /** Why a cost was lost or recorded irregularly, even if the collector caught the error; else null. */
  failure(): string | null;
};

// An unknown or invalid price never gets a call through; every call costs at least 1 micro-AUD.
const isPrice = (micro: number) =>
  Number.isSafeInteger(micro) && micro >= 1 && micro <= MAX_CALL_MICRO_AUD;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Job events are stored text, read in any locale: "A$" is unambiguous.
const REASON_LOCALE = "en-US";

const UNASKED = "paid call made without budget.allow";

/** Cost recording and the budget check for one collector's run in one scan. */
export function makeSpend(
  db: Db,
  input: {
    capMicroAud: number;
    timeZone: string;
    now: () => Date;
    productId: string;
    collector: string;
    jobId: number;
    /** Job events: a cost above its estimate, or one refused after the run ended. */
    log?: (text: string) => void;
  },
): Spend {
  const who = { collector: input.collector, productId: input.productId, jobId: input.jobId };
  // This run's reservations not yet settled, oldest first.
  const pending: { id: number; estimate: number }[] = [];
  let closed = false;
  let failure: string | null = null;
  const fail = (text: string) => {
    failure ??= text;
    if (closed) input.log?.(text);
  };

  function record(call: PaidCall) {
    const now = input.now();
    // A refused cost leaves its reservation counted (the call may have been billed): it is
    // taken out of `pending` first so the end of the run does not drop it.
    const reservation = pending.shift();
    try {
      if (reservation === undefined) {
        recordCost(db, { ...call, ...who }, now);
        fail(UNASKED);
        return;
      }
      if (!settleCost(db, reservation.id, call)) {
        // Never expected (only this run settles its rows), but a cost is never dropped.
        recordCost(db, { ...call, ...who }, now);
        fail(`reservation ${reservation.id} was gone; the cost was recorded on its own`);
        return;
      }
      if (call.amountMicroAud > reservation.estimate) {
        const actual = formatAudPrecise(call.amountMicroAud, REASON_LOCALE);
        const estimate = formatAudPrecise(reservation.estimate, REASON_LOCALE);
        input.log?.(`Paid call cost ${actual}, above its ${estimate} estimate`);
      }
    } catch (error) {
      fail(`Could not record a paid call's cost: ${message(error)}`);
      throw error;
    }
  }

  return {
    budget: {
      allow(estimateMicroAud) {
        if (closed || !isPrice(estimateMicroAud)) return false;
        const now = input.now();
        const window = monthWindow(now, input.timeZone);
        const id = reserveCost(
          db,
          { ...who, amountMicroAud: estimateMicroAud, capMicroAud: input.capMicroAud, window },
          now,
        );
        if (id === null) return false;
        pending.push({ id, estimate: estimateMicroAud });
        return true;
      },
    },
    cost: { record },
    release(ended) {
      closed = true;
      if (ended === "returned")
        dropReservations(
          db,
          pending.splice(0).map((r) => r.id),
        );
    },
    failure: () => failure,
  };
}

/** A free collector's spend: no budget and no way to record a cost. */
export function noSpend(collector: string): Spend {
  let failure: string | null = null;
  return {
    budget: { allow: () => false },
    cost: {
      record() {
        failure = `${collector} is not a paid collector: it cannot record costs`;
        throw new Error(failure);
      },
    },
    release() {},
    failure: () => failure,
  };
}

/** Why a paid collector is skipped before it runs, or null. */
export function budgetSkipReason(
  db: Db,
  capMicroAud: number,
  timeZone: string,
  now: Date,
): string | null {
  if (capMicroAud <= 0) return "budget: no monthly budget set (HARBOUR_MONTHLY_BUDGET_AUD)";
  const { start, end } = monthWindow(now, timeZone);
  const spent = spentBetween(db, start, end);
  if (budgetLevel(spent, capMicroAud) !== "reached") return null;
  const cap = formatAud(capMicroAud, REASON_LOCALE);
  return `budget: ${cap} monthly budget reached (${formatAud(spent, REASON_LOCALE)} spent)`;
}
