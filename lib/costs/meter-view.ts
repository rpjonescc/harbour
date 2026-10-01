// What Today's cost meter shows. Web-safe: reads the ledger, never a secret's value.
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { monthWindow } from "@/lib/format/zoned-time";
import { audToMicro, budgetLevel, projectMonth } from "./budget";
import { spentBetween } from "./ledger";
import { connectedPaidSources, PAID_SOURCES, type PaidSource } from "./paid-sources";

// The ledger is the complete record of paid calls, so no rows this month is a real A$0.00.
export type CostMeterView =
  | { state: "no-paid-sources"; spentMicro: number }
  /** Paid sources connected, cap 0: paid calls are off. */
  | { state: "no-budget"; spentMicro: number }
  | {
      state: "ok" | "warn" | "reached";
      spentMicro: number;
      capMicro: number;
      projectedMicro: number | null;
    };

/** This month's paid spend against the budget, in `HARBOUR_TIMEZONE`'s calendar month. */
export function costMeterView(
  db: Db,
  config: Config,
  now: Date,
  sources: readonly PaidSource[] = PAID_SOURCES,
): CostMeterView {
  const { start, end } = monthWindow(now, config.HARBOUR_TIMEZONE);
  const spentMicro = spentBetween(db, start, end);
  if (connectedPaidSources(config, sources).length === 0) {
    return { state: "no-paid-sources", spentMicro };
  }
  const capMicro = audToMicro(config.HARBOUR_MONTHLY_BUDGET_AUD);
  const level = budgetLevel(spentMicro, capMicro);
  if (level === "none") return { state: "no-budget", spentMicro };
  return {
    state: level,
    spentMicro,
    capMicro,
    projectedMicro: projectMonth(spentMicro, now, config.HARBOUR_TIMEZONE),
  };
}
