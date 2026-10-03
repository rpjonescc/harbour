// Why paid calls are not allowed right now (no budget, or it is used up). Web-safe: reads the
// ledger only, so the web can refuse a request the worker would only skip.
import type { Db } from "@/lib/db/client";
import { monthWindow } from "@/lib/format/zoned-time";
import { budgetLevel, formatAud } from "./budget";
import { spentBetween } from "./ledger";

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
