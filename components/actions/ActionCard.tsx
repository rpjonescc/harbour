import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import type { ActionView } from "@/lib/actions/views";
import {
  EFFORT_PHRASE,
  IMPACT_PHRASE,
  impactTone,
  STATUS_COLUMN,
  statusChip,
} from "@/lib/explain/actions";
import { AREAS, areaKeyOf } from "@/lib/explain/areas";
import { formatIsoDay } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import { firstSentence } from "@/lib/today/reason";
import { ActionHistory } from "./ActionHistory";
import { ActionStatusControls } from "./ActionStatusControls";
import { ActionTechnical } from "./ActionTechnical";
import { impactHeadingId } from "./focus-after-change";
import { PullRequestLink } from "./PullRequestLink";

/**
 * One action on the board: the plain title and one line on why, how big a win it is and who's on
 * it, a quiet area, effort and product line, and its pull request; the full reason and the
 * technical parts are folded away. Every text field is rendered as plain text: agent-written
 * titles and reasons are untrusted.
 */
export function ActionCard({
  action,
  product,
  locale,
  timeZone,
  today,
  demo = false,
}: {
  action: ActionView;
  product: Product;
  locale: string;
  timeZone: string;
  /** YYYY-MM-DD in HARBOUR_TIMEZONE. */
  today: string;
  /** /design examples: the controls never call the API. */
  demo?: boolean;
}) {
  const headingId = `action-${action.id}-title`;
  const reason = firstSentence(action.why);
  const chip = statusChip(action, (day) => formatIsoDay(day, locale));
  return (
    <Panel className="p-4">
      <article
        id={`action-${action.id}`}
        aria-labelledby={headingId}
        data-action-id={action.id}
        data-impact={action.impact}
        data-group-heading={impactHeadingId(action.impact)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={impactTone(action.impact)}>{IMPACT_PHRASE[action.impact]}</Tag>
          <Tag tone={chip.tone}>{chip.text}</Tag>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 id={headingId} tabIndex={-1} className="text-lg font-medium text-ink">
            {action.title}
          </h3>
          {reason && <p className="text-sm text-ink-muted">{reason}</p>}
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <ProductDot product={product} />
            <span>
              {AREAS[areaKeyOf(action.area)].name} · {EFFORT_PHRASE[action.effort]} · {product.name}
              {action.status === "in_progress" && action.who && ` · ${STATUS_COLUMN.in_progress}`}
            </span>
          </p>
        </div>
        <PullRequestLink url={action.prUrl} />
        <ActionHistory
          title={action.title}
          events={action.events}
          truncated={action.historyTruncated}
          timeZone={timeZone}
          locale={locale}
        />
        <div className="border-t border-line pt-3">
          <ActionStatusControls
            id={action.id}
            title={action.title}
            status={action.status}
            today={today}
            demo={demo}
          />
        </div>
        <ActionTechnical action={action} product={product} />
      </article>
    </Panel>
  );
}
