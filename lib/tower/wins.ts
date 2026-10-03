// "Wins this week" (spec §4.8): at most five lines and seven small bars. Pure: no I/O.

import type { Named } from "@/lib/agents/view";
import { AREAS } from "@/lib/explain/areas";
import { QUIET_WEEK } from "@/lib/explain/tower";
import { WIN_LINE } from "@/lib/explain/tower-activity";
import { verdictFor } from "@/lib/explain/verdict";
import { zonedInstant } from "@/lib/format/zoned-time";
import type { WinsFacts } from "./wins-data";

export type WeekWins = {
  /** At most 5. */
  lines: string[];
  /** Cards finished each of the last seven local days, oldest first, labelled "Mon"… */
  bars: { day: string; label: string; count: number }[];
  /** The kind line for a week with nothing to list; null otherwise. */
  quiet: string | null;
};

const LINES = 5;

/** The week's wins in words; a rise across verdict bands says so in the verdict's words. */
export function weekWins(
  facts: WinsFacts,
  products: readonly Named[],
  timeZone: string,
  locale: string,
): WeekWins {
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const cards = facts.doneByDay.reduce((sum, d) => sum + d.count, 0);
  const withPr = facts.doneByDay.reduce((sum, d) => sum + d.withPr, 0);
  const rises = facts.rises.map(({ productId, area, from, to }) => {
    const [before, after] = [verdictFor(from).label, verdictFor(to).label];
    return before === after
      ? WIN_LINE.upBy(name(productId), AREAS[area].name, to - from)
      : WIN_LINE.wentFrom(name(productId), AREAS[area].name, before, after);
  });
  const lines = [
    ...(cards > 0 ? [WIN_LINE.cardsFinished(cards, withPr)] : []),
    ...rises,
    ...facts.indexedGain.map((g) => WIN_LINE.newlyInGoogle(name(g.productId), g.to - g.from)),
    ...(facts.approvedPieces ? [WIN_LINE.approved(facts.approvedPieces)] : []),
  ];
  // Noon on the day: a weekday name that no clock change can move to a neighbouring day.
  const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" });
  return {
    lines: lines.slice(0, LINES),
    bars: facts.doneByDay.map(({ day, count }) => ({
      day,
      label: weekday.format(zonedInstant(day, 12 * 60, timeZone)),
      count,
    })),
    quiet: lines.length === 0 ? QUIET_WEEK : null,
  };
}
