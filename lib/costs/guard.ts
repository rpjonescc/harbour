// The budget guard and cost recording a scan hands its collectors. Worker only.
import type { Db } from "@/lib/db/client";
import { monthWindow } from "@/lib/format/zoned-time";
import type { CollectContext } from "@/lib/scan/types";
import { budgetLevel, canSpend, formatAud } from "./budget";
import { MAX_CALL_MICRO_AUD, recordCost, spentBetween } from "./ledger";

/** What a collector spends through, plus the runner's side: settle up and check for a lost cost. */
export type Spend = Pick<CollectContext, "cost" | "budget"> & {
  /** Frees what this collector reserved but never recorded (call it once the collector ends). */
  release(): void;
  /** Why a cost could not be recorded, even if the collector caught the error; else null. */
  failure(): string | null;
};

type Reservation = { amountMicro: number };

// Estimates allowed but not yet recorded, per database, across every collector in this process:
// a call in flight counts against the budget, so two calls cannot both pass a check only one
// fits. Check and reserve run synchronously (better-sqlite3), so nothing interleaves; collectors
// run only in the worker, so this process is the only one spending.
const inFlight = new WeakMap<Db, Set<Reservation>>();

function reservationsOf(db: Db): Set<Reservation> {
  const existing = inFlight.get(db);
  if (existing) return existing;
  const created = new Set<Reservation>();
  inFlight.set(db, created);
  return created;
}

const reservedTotal = (set: Set<Reservation>) =>
  [...set].reduce((sum, r) => sum + r.amountMicro, 0);

// An unknown or invalid price never gets a call through.
const isPrice = (micro: number) =>
  Number.isSafeInteger(micro) && micro >= 0 && micro <= MAX_CALL_MICRO_AUD;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
  },
): Spend {
  const shared = reservationsOf(db);
  const mine: Reservation[] = [];
  let failure: string | null = null;
  return {
    budget: {
      allow(estimateMicroAud) {
        if (!isPrice(estimateMicroAud)) return false;
        const { start, end } = monthWindow(input.now(), input.timeZone);
        const committed = spentBetween(db, start, end) + reservedTotal(shared);
        if (!canSpend(committed, input.capMicroAud, estimateMicroAud)) return false;
        const reservation = { amountMicro: estimateMicroAud };
        shared.add(reservation);
        mine.push(reservation);
        return true;
      },
    },
    cost: {
      record({ provider, units, amountMicroAud }) {
        const { productId, collector, jobId } = input;
        try {
          recordCost(
            db,
            { provider, collector, productId, units, amountMicroAud, jobId },
            input.now(),
          );
        } catch (error) {
          failure ??= `Could not record a paid call's cost: ${message(error)}`;
          throw error;
        }
        // The actual cost is in the ledger now: settle the oldest estimate it replaces.
        const settled = mine.shift();
        if (settled) shared.delete(settled);
      },
    },
    release() {
      for (const reservation of mine.splice(0)) shared.delete(reservation);
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
