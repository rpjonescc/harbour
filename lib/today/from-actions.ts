import { activeWork } from "@/lib/actions/active-work";
import type { ActionRow } from "@/lib/actions/types";
import { topActiveActions } from "@/lib/actions/views";
import type { Db } from "@/lib/db/client";
import { whoIsOnIt } from "@/lib/explain/actions";
import type { BriefingWork } from "@/lib/explain/briefing";
import type { ActionPreview } from "./types";

const TOP_ACTIONS = 3;

const toPreview = (action: ActionRow): ActionPreview => ({
  id: action.id,
  productId: action.productId,
  area: action.area,
  impact: action.impact,
  title: action.title,
  detail: action.fix,
  href: `/actions#action-${action.id}`,
});

/**
 * Today's actions: the top active ones (open and in progress, board order) of the configured
 * products, how many more the Actions board holds, and every active action's area and who's on
 * it, for the briefing.
 */
export function attentionFromActions(
  db: Db,
  productIds: readonly string[],
): { actions: ActionPreview[]; more: number; work: BriefingWork[] } {
  const top = topActiveActions(db, productIds, TOP_ACTIONS);
  return {
    actions: top.actions.map(toPreview),
    more: top.more,
    work: activeWork(db, productIds).map((a) => ({
      productId: a.productId,
      area: a.area,
      who: whoIsOnIt(a),
    })),
  };
}
