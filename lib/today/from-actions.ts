import { activeWork } from "@/lib/actions/active-work";
import type { ActionRow } from "@/lib/actions/types";
import { topActiveActions } from "@/lib/actions/views";
import type { Db } from "@/lib/db/client";
import { type WhoOnIt, whoIsOnIt } from "@/lib/explain/actions";
import type { BriefingWork } from "@/lib/explain/briefing";
import { firstSentence } from "./reason";
import type { ActionPreview } from "./types";

const TOP_ACTIONS = 3;

const toPreview = (action: ActionRow, who: WhoOnIt | null): ActionPreview => ({
  id: action.id,
  productId: action.productId,
  area: action.area,
  impact: action.impact,
  effort: action.effort,
  title: action.title,
  reason: firstSentence(action.why),
  who,
  href: `/actions#action-${action.id}`,
});

/**
 * Today's actions: the top active ones (open and in progress, board order) of the configured
 * products with who's on each, how many more the Actions board holds, and every active action's
 * area and who's on it, for the briefing.
 */
export function attentionFromActions(
  db: Db,
  productIds: readonly string[],
): { actions: ActionPreview[]; more: number; work: BriefingWork[] } {
  const active = activeWork(db, productIds);
  const who = new Map(active.map((a) => [a.id, whoIsOnIt(a)]));
  const top = topActiveActions(db, productIds, TOP_ACTIONS);
  return {
    actions: top.actions.map((row) => toPreview(row, who.get(row.id) ?? null)),
    more: top.more,
    work: active.map((a) => ({ productId: a.productId, area: a.area, who: who.get(a.id) ?? null })),
  };
}
