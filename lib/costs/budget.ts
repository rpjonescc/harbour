// Monthly budget arithmetic in integer micro-AUD. Pure: no I/O.
import { monthWindow } from "@/lib/format/zoned-time";

/** Micro-AUD in one Australian dollar. */
export const MICRO_PER_AUD = 1_000_000;

/** Most one call may cost: a single call above A$100 is a unit-price bug, not a real call. */
export const MAX_CALL_MICRO_AUD = 100 * MICRO_PER_AUD;

const DAY_MS = 24 * 60 * 60_000;

/** Dollars to whole micro-AUD (rounded), so sums of fractions of a cent stay exact. */
export function audToMicro(aud: number): number {
  return Math.round(aud * MICRO_PER_AUD);
}

/** none: no budget set (cap 0); warn from 80 % of the cap; reached from 100 %. */
export type BudgetLevel = "none" | "ok" | "warn" | "reached";

/** How far this month's spend is into the cap. */
export function budgetLevel(spentMicro: number, capMicro: number): BudgetLevel {
  if (capMicro <= 0) return "none";
  if (spentMicro >= capMicro) return "reached";
  // Integer comparison for 80 %: spent / cap ≥ 4 / 5.
  return spentMicro * 5 >= capMicro * 4 ? "warn" : "ok";
}

/** Whether a call estimated at `estimateMicro` fits: never without a budget. */
export function canSpend(spentMicro: number, capMicro: number, estimateMicro: number): boolean {
  return capMicro > 0 && spentMicro + estimateMicro <= capMicro;
}

/** Linear month-end projection; null before one full local day has passed or when nothing was spent. */
export function projectMonth(spentMicro: number, now: Date, timeZone: string): number | null {
  if (spentMicro <= 0) return null;
  const { start, end } = monthWindow(now, timeZone);
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < DAY_MS) return null;
  return Math.round((spentMicro * (end.getTime() - start.getTime())) / elapsed);
}

/** Micro-AUD as Australian dollars with two decimals, e.g. "A$12.40" (en-GB). */
export function formatAud(micro: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(micro / MICRO_PER_AUD);
}
