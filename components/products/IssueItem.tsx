import Link from "next/link";
import { CopyPromptButton } from "@/components/ui/CopyPromptButton";
import { Tag } from "@/components/ui/Tag";
import type { RuleActionStatus } from "@/lib/actions/views";
import { IMPACT_PHRASE, STATUS_COLUMN } from "@/lib/explain/actions";
import { formatIsoDay } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import { handoffPrompt } from "@/lib/scan/handoff";
import type { Issue } from "@/lib/scan/issues";

/** Where the issue's action stands; the issue is on the page, so a done action is still found. */
function actionStatusText(action: RuleActionStatus | null, locale: string): string {
  if (action === null) return "Tracking starts with the next scan";
  if (action.status === "done") return "Done — still found in the last scan";
  if (action.status === "snoozed" && action.snoozedUntil) {
    return `Snoozed until ${formatIsoDay(action.snoozedUntil, locale)}`;
  }
  return STATUS_COLUMN[action.status];
}

/**
 * One issue: what is wrong, where, the fix, how to tell it is done, its action's status and
 * the hand-off.
 */
export function IssueItem({
  issue,
  action,
  product,
  locale,
}: {
  issue: Issue;
  /** The issue's action; null before the rule sync has created one. */
  action: RuleActionStatus | null;
  product: Product;
  locale: string;
}) {
  const headingId = `issue-${issue.id}`;
  const more = issue.total - issue.locations.length;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap gap-1.5">
        <Tag tone={issue.impact === "high" ? "warn" : "neutral"}>{IMPACT_PHRASE[issue.impact]}</Tag>
        <Tag tone="accent">{issue.area}</Tag>
        <Tag tone={action?.status === "done" ? "warn" : "neutral"}>
          {actionStatusText(action, locale)}
        </Tag>
      </div>
      <h3 id={headingId} className="text-sm font-medium text-ink">
        {issue.title}
      </h3>
      <p className="text-sm text-ink-muted">{issue.problem}</p>
      <details className="text-xs">
        <summary className="cursor-pointer rounded-sm text-accent">
          {issue.total === 1 ? "Where" : `Where (${issue.total})`}
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5 break-all font-mono text-ink-muted">
          {issue.locations.map((location) => (
            <li key={location}>{location}</li>
          ))}
          {more > 0 && <li>…and {more} more</li>}
        </ul>
      </details>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-muted">Fix</dt>
        <dd>{issue.fix}</dd>
        <dt className="text-ink-muted">Done when</dt>
        <dd>{issue.check}</dd>
      </dl>
      {action && (
        <p className="text-xs">
          <Link
            href={`/actions?product=${encodeURIComponent(product.id)}&status=all#action-${action.id}`}
            aria-describedby={headingId}
            className="rounded-sm text-accent underline underline-offset-2"
          >
            View on the Actions board
          </Link>
        </p>
      )}
      <CopyPromptButton prompt={handoffPrompt(product, issue)} title={issue.title} />
    </article>
  );
}
