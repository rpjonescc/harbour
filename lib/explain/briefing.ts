import type { BackupHealth } from "@/lib/ops/backup-status";
import type { IssueArea } from "@/lib/scan/issues";
import { plural } from "@/lib/scan/scoring/sub-score";
import type { AreaKey, AreaValues } from "@/lib/scan/views";
import type { WhoOnIt } from "./actions";
import { AREA_ORDER, AREAS, areaKeyOf } from "./areas";
import { sourceTrouble } from "./sources";
import { averageScore, verdictFor } from "./verdict";

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
  /** Products whose newest check failed outright. */
  failedChecks: readonly string[];
  backup: BackupHealth;
};

export type Briefing = { sentence: string; subLine: string };

function health(input: BriefingInput): string {
  const values = input.scores.flatMap(({ totals }) =>
    AREA_ORDER.flatMap((key) => {
      const value = totals[key];
      return value === null ? [] : [value];
    }),
  );
  const mean = averageScore(values);
  if (mean === null) return "Harbour has no scores yet, so there's no verdict.";
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

/** The backup states that need a look, worded like Today's backup notice. */
const BACKUP_TROUBLE: Partial<Record<BackupHealth, string>> = {
  failed: "the last backup didn't finish",
  stale: "no backup in the last 2 days",
  unreadable: "Harbour can't open the backup folder",
};

/** Checks that failed outright; a product whose failing sources are listed is said there. */
function checkTrouble(input: BriefingInput): string | null {
  const named = new Set(input.failures.map((f) => f.productId));
  const failed = input.products.filter(
    (p) => input.failedChecks.includes(p.id) && !named.has(p.id),
  );
  const [only] = failed;
  if (only === undefined) return null;
  if (input.products.length === 1) return "the last check didn't finish";
  if (failed.length === 1) return `the last check for ${only.name} didn't finish`;
  return `the last check for ${failed.length} sites didn't finish`;
}

function subLine(input: BriefingInput): string {
  const n = input.work.length;
  const parts = [n === 0 ? "Nothing on the to-do list" : `${n} ${plural(n, "thing")} worth doing`];
  const claude = input.work.filter((w) => w.who === "claude").length;
  if (claude > 0) parts.push(`Claude is handling ${claude}`);
  const trouble = [
    checkTrouble(input),
    sourceTrouble(input.failures),
    BACKUP_TROUBLE[input.backup],
  ];
  const broken = trouble.filter((t): t is string => typeof t === "string");
  parts.push(...(broken.length > 0 ? broken : ["nothing is broken"]));
  return parts.join(" · ");
}

/**
 * Today's briefing, by fixed rules (spec §5.1): overall health is the band of the rounded mean
 * of every area score there is; the biggest opportunity is the lowest-scoring area of any
 * product that has an active action. The sub-line counts active actions and Claude's share, then
 * names anything broken (a check that didn't finish, a failing data source, a backup that needs a
 * look), and says "nothing is broken" only when nothing is.
 */
export function buildBriefing(input: BriefingInput): Briefing {
  const found = opportunity(input);
  return {
    sentence: found ? `${health(input)} ${found}` : health(input),
    subLine: subLine(input),
  };
}
