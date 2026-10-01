// What Today's cost meter shows. Web-safe: reads the ledger, never a secret's value.
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { monthWindow } from "@/lib/format/zoned-time";
import { audToMicro, budgetLevel, projectMonth } from "./budget";
import { spentBetween, unconfirmedBetween } from "./ledger";
import { connectedPaidSources, PAID_SOURCES, type PaidSource } from "./paid-sources";

// The ledger is the complete record of paid calls, so no rows this month is a real A$0.00.
// `spentMicro` includes `unconfirmedMicro`: reservations for calls in flight, or left by a crash
// mid-call, which count until settled.
type Spend = { spentMicro: number; unconfirmedMicro: number };

export type CostMeterView =
  | ({ state: "no-paid-sources" } & Spend)
  /** Paid sources connected, cap 0: paid calls are off. */
  | ({ state: "no-budget" } & Spend)
  | ({
      state: "ok" | "warn" | "reached";
      capMicro: number;
      projectedMicro: number | null;
    } & Spend);

/** This month's paid spend against the budget, in `HARBOUR_TIMEZONE`'s calendar month. */
export function costMeterView(
  db: Db,
  config: Config,
  now: Date,
  sources: readonly PaidSource[] = PAID_SOURCES,
): CostMeterView {
  const { start, end } = monthWindow(now, config.HARBOUR_TIMEZONE);
  const spend: Spend = {
    spentMicro: spentBetween(db, start, end),
    unconfirmedMicro: unconfirmedBetween(db, start, end),
  };
  if (connectedPaidSources(config, sources).length === 0) {
    return { state: "no-paid-sources", ...spend };
  }
  const capMicro = audToMicro(config.HARBOUR_MONTHLY_BUDGET_AUD);
  const level = budgetLevel(spend.spentMicro, capMicro);
  if (level === "none") return { state: "no-budget", ...spend };
  return {
    state: level,
    ...spend,
    capMicro,
    projectedMicro: projectMonth(spend.spentMicro, now, config.HARBOUR_TIMEZONE),
  };
}
