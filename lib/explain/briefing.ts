import type { IssueArea } from "@/lib/scan/issues";
import { plural } from "@/lib/scan/scoring/sub-score";
import type { AreaKey, AreaValues } from "@/lib/scan/views";
import type { WhoOnIt } from "./actions";
import { AREA_ORDER, AREAS, areaKeyOf } from "./areas";
import { sourceTrouble } from "./sources";
import { verdictFor } from "./verdict";

/** One active (open or in-progress) action, as the briefing counts it. */
export type BriefingWork = { productId: string; area: IssueArea; who: WhoOnIt | null };

export type BriefingInput = {
  /** Configured products in config order: ties go to the earlier one. */
  products: readonly { id: string; name: string }[];
  scores: readonly { productId: string; totals: AreaValues<number | null> }[];
  /** Every active action of those products. */
  work: readonly BriefingWork[];
  /** Data sources that failed in each product's last check. */
  failures: readonly { productId: string; collector: string }[];
};

export type Briefing = { sentence: string; subLine: string };

function health(input: BriefingInput): string {
  const values = input.scores.flatMap(({ totals }) =>
    AREA_ORDER.flatMap((key) => {
      const value = totals[key];
      return value === null ? [] : [value];
    }),
  );
  if (values.length === 0) return "Harbour has no scores yet, so there's no verdict.";
  const mean = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const one = input.products.length === 1;
  const { label } = verdictFor(mean);
  if (label === "Needs work")
    return one ? "Your site needs some work." : "Your sites need some work.";
  return `${one ? "Your site is" : "Your sites are"} in ${label.toLowerCase()} shape.`;
}

type Opportunity = { productName: string; area: AreaKey; score: number };

function opportunity(input: BriefingInput): string | null {
  let best: Opportunity | null = null;
  for (const product of input.products) {
    const totals = input.scores.find((s) => s.productId === product.id)?.totals;
    if (!totals) continue;
    for (const area of AREA_ORDER) {
      const score = totals[area];
      const active = input.work.some(
        (w) => w.productId === product.id && areaKeyOf(w.area) === area,
      );
      // Strictly lower wins, so a tie keeps the earlier product, then the earlier area.
      if (score !== null && active && (best === null || score < best.score)) {
        best = { productName: product.name, area, score };
      }
    }
  }
  if (best === null) return null;
  const verdict = verdictFor(best.score).label.toLowerCase();
  return `Biggest opportunity: ${AREAS[best.area].name} for ${best.productName} (${verdict}).`;
}

function subLine(input: BriefingInput): string {
  const n = input.work.length;
  const parts = [n === 0 ? "Nothing on the to-do list" : `${n} ${plural(n, "thing")} worth doing`];
  const claude = input.work.filter((w) => w.who === "claude").length;
  if (claude > 0) parts.push(`Claude is handling ${claude}`);
  parts.push(sourceTrouble(input.failures) ?? "nothing is broken");
  return parts.join(" · ");
}

/**
 * Today's briefing, by fixed rules (spec §5.1): overall health is the band of the rounded mean
 * of every area score there is; the biggest opportunity is the lowest-scoring area of any
 * product that has an active action. The sub-line counts active actions, Claude's share and
 * any data source that failed.
 */
export function buildBriefing(input: BriefingInput): Briefing {
  const found = opportunity(input);
  return {
    sentence: found ? `${health(input)} ${found}` : health(input),
    subLine: subLine(input),
  };
}
