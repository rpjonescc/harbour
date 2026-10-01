import { and, count, inArray } from "drizzle-orm";
import { ACTIVE, type ActionRow } from "@/lib/actions/types";
import { topActiveActions } from "@/lib/actions/views";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import type { Impact } from "@/lib/scan/issues";
import type { ActionPreview } from "./types";

const TOP_ACTIONS = 3;
const IMPACTS: readonly Impact[] = ["high", "medium", "low"];

const toPreview = (action: ActionRow): ActionPreview => ({
  id: action.id,
  productId: action.productId,
  area: action.area,
  impact: action.impact,
  title: action.title,
  detail: action.fix,
  href: `/actions#action-${action.id}`,
});

/** The impact of every active action (high first), so the headline counts them all. */
function activeImpacts(db: Db, productIds: readonly string[]): Impact[] {
  if (productIds.length === 0) return [];
  const rows = db
    .select({ impact: actions.impact, n: count() })
    .from(actions)
    .where(and(inArray(actions.productId, [...productIds]), inArray(actions.status, [...ACTIVE])))
    .groupBy(actions.impact)
    .all();
  const byImpact = new Map(rows.map((row) => [row.impact, row.n]));
  return IMPACTS.flatMap((impact) => Array<Impact>(byImpact.get(impact) ?? 0).fill(impact));
}

/**
 * Today's "Worth your attention": the top active actions (open and in progress, board order) of
 * the configured products, how many more the Actions board holds, and every active impact.
 */
export function attentionFromActions(
  db: Db,
  productIds: readonly string[],
): { actions: ActionPreview[]; more: number; headlineImpacts: Impact[] } {
  const top = topActiveActions(db, productIds, TOP_ACTIONS);
  return {
    actions: top.actions.map(toPreview),
    more: top.more,
    headlineImpacts: activeImpacts(db, productIds),
  };
}
