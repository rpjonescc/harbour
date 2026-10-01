// The budget guard and cost recording a scan hands its collectors. Worker only.
import type { Db } from "@/lib/db/client";
import { monthWindow } from "@/lib/format/zoned-time";
import type { CollectContext } from "@/lib/scan/types";
import { budgetLevel, formatAud, MAX_CALL_MICRO_AUD } from "./budget";
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
   * Called once the collector's run ends; no call is allowed after it. A run that ended normally
   * drops its unrecorded reservations; an abandoned one (timeout, cancel) keeps them counted,
   * since its calls may still be in flight, until a late record settles them.
   */
  release(abandoned: boolean): void;
  /** Why a cost was lost or recorded irregularly, even if the collector caught the error; else null. */
  failure(): string | null;
};

// An unknown or invalid price never gets a call through; every call costs at least 1 micro-AUD.
const isPrice = (micro: number) =>
  Number.isSafeInteger(micro) && micro >= 1 && micro <= MAX_CALL_MICRO_AUD;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
    /** Reports a cost refused after the run ended (it can no longer fail the collector). */
    log?: (text: string) => void;
  },
): Spend {
  const who = { collector: input.collector, productId: input.productId, jobId: input.jobId };
  // This run's reservations not yet settled, oldest first.
  const pending: number[] = [];
  let closed = false;
  let failure: string | null = null;
  const fail = (text: string) => {
    failure ??= text;
    if (closed) input.log?.(text);
  };

  function record(call: PaidCall) {
    const now = input.now();
    const id = pending[0];
    try {
      if (id === undefined) {
        recordCost(db, { ...call, ...who }, now);
        fail(UNASKED);
        return;
      }
      // A refused cost leaves its reservation counted (the call may have been billed): it is
      // taken out of `pending` so the end of the run does not drop it.
      pending.shift();
      if (settleCost(db, id, call, now)) return;
      // Never expected (only this run settles its rows), but a cost is never dropped.
      recordCost(db, { ...call, ...who }, now);
      fail(`reservation ${id} was gone; the cost was recorded on its own`);
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
        pending.push(id);
        return true;
      },
    },
    cost: { record },
    release(abandoned) {
      closed = true;
      if (!abandoned) dropReservations(db, pending.splice(0));
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

// Job events are stored text, read in any locale: "A$" is unambiguous.
const REASON_LOCALE = "en-US";

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
