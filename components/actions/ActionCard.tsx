import Link from "next/link";
import { CopyPromptButton } from "@/components/ui/CopyPromptButton";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import { actionHandoffPrompt } from "@/lib/actions/handoff";
import type { ActionView } from "@/lib/actions/views";
import { brainHref } from "@/lib/brain/wikilinks";
import { EFFORT_PHRASE, IMPACT_PHRASE, STATUS_COLUMN } from "@/lib/explain/actions";
import { formatIsoDay } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import { ActionEvidence } from "./ActionEvidence";
import { ActionHistory } from "./ActionHistory";
import { ActionStatusControls } from "./ActionStatusControls";
import { SOURCE_LABEL } from "./action-labels";
import { PullRequestLink } from "./PullRequestLink";

function statusText(action: ActionView, locale: string): string {
  if (action.status === "snoozed" && action.snoozedUntil) {
    return `Snoozed until ${formatIsoDay(action.snoozedUntil, locale)}`;
  }
  return STATUS_COLUMN[action.status];
}

function DocLinks({ links, invalid }: { links: ActionView["docLinks"]; invalid: boolean }) {
  if (invalid)
    return <p className="text-xs text-ink-muted">Harbour could not read the related docs.</p>;
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Related docs">
      {links.map(({ path, exists }) => (
        <li key={path} className="break-all font-mono">
          {exists ? (
            <Link
              href={brainHref(path)}
              className="rounded-sm text-accent underline underline-offset-2"
            >
              {path}
            </Link>
          ) : (
            <span className="text-ink-muted">{path} (not in the brain)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * One action on the board. Every text field is rendered as plain text: agent-written titles
 * and reasons are untrusted, so React's escaping is the only formatting they get.
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
          <Tag tone="accent">{action.area}</Tag>
          <span className="inline-flex items-center gap-1.5 px-1 text-2xs text-ink-muted">
            <ProductDot product={product} />
            {product.name}
          </span>
          <Tag tone={action.status === "suggested" ? "accent" : "neutral"}>
            {statusText(action, locale)}
          </Tag>
          <span className="text-2xs text-ink-muted">{SOURCE_LABEL[action.source]}</span>
        </div>
        <div className="flex flex-col gap-1">
          <h3 id={headingId} tabIndex={-1} className="text-base font-medium text-ink">
            {action.title}
          </h3>
          <p className="text-sm text-ink-muted">{action.why}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-ink-muted">Fix</dt>
          <dd>{action.fix}</dd>
          <dt className="text-ink-muted">Done when</dt>
          <dd>{action.check}</dd>
          <dt className="text-ink-muted">Effort</dt>
          <dd>{EFFORT_PHRASE[action.effort]}</dd>
        </dl>
        <ActionEvidence evidence={action.evidence} invalid={action.evidenceInvalid} />
        <DocLinks links={action.docLinks} invalid={action.docsInvalid} />
        <PullRequestLink url={action.prUrl} />
        <ActionHistory
          events={action.events}
          truncated={action.historyTruncated}
          timeZone={timeZone}
          locale={locale}
        />
        <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-start sm:justify-between">
          <ActionStatusControls
            id={action.id}
            title={action.title}
            status={action.status}
            today={today}
            demo={demo}
          />
          <CopyPromptButton prompt={actionHandoffPrompt(product, action)} title={action.title} />
        </div>
      </article>
    </Panel>
  );
}
