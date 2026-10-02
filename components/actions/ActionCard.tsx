import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import type { ActionView } from "@/lib/actions/views";
import { EFFORT_PHRASE, IMPACT_PHRASE, STATUS_COLUMN, WHO_PHRASE } from "@/lib/explain/actions";
import { AREAS, areaKeyOf } from "@/lib/explain/areas";
import { formatIsoDay } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import { ActionHistory } from "./ActionHistory";
import { ActionStatusControls } from "./ActionStatusControls";
import { ActionTechnical } from "./ActionTechnical";
import { PullRequestLink } from "./PullRequestLink";

function statusText(action: ActionView, locale: string): string {
  if (action.status === "snoozed" && action.snoozedUntil) {
    return `Snoozed until ${formatIsoDay(action.snoozedUntil, locale)}`;
  }
  return STATUS_COLUMN[action.status];
}

/**
 * One action on the board: the plain title, why it matters, how big and how much of a win, who's
 * on it and its pull request; the technical parts are folded away. Every text field is rendered
 * as plain text: agent-written titles and reasons are untrusted.
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
  return (
    <Panel className="p-4">
      <article
        id={`action-${action.id}`}
        aria-labelledby={headingId}
        data-action-id={action.id}
        data-impact={action.impact}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={action.impact === "high" ? "warn" : "neutral"}>
            {IMPACT_PHRASE[action.impact]}
          </Tag>
          <Tag tone="accent">
            {AREAS[areaKeyOf(action.area)].name} · {EFFORT_PHRASE[action.effort]}
          </Tag>
          <Tag tone={action.status === "suggested" ? "accent" : "neutral"}>
            {statusText(action, locale)}
          </Tag>
          <span className="inline-flex items-center gap-1.5 px-1 text-2xs text-ink-muted">
            <ProductDot product={product} />
            {product.name}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h3 id={headingId} tabIndex={-1} className="text-base font-medium text-ink">
            {action.title}
          </h3>
          <p className="text-sm text-ink-muted">{action.why}</p>
          {action.who && <p className="text-sm text-ink">{WHO_PHRASE[action.who]}</p>}
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
