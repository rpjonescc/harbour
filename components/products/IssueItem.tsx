import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { CopyPromptButton } from "@/components/ui/CopyPromptButton";
import { Tag } from "@/components/ui/Tag";
import type { RuleActionStatus } from "@/lib/actions/views";
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
import { handoffPrompt } from "@/lib/scan/handoff";
import type { Issue } from "@/lib/scan/issues";

/**
 * One issue: a plain title, one line on why it matters and its size of win; the area, where, the
 * fix, the check and the hand-off are folded into Technical details.
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
  // The issue is on the page, so a done action is still found.
  const chip = statusChip(action, (day) => formatIsoDay(day, locale), true);
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap gap-1.5">
        <Tag tone={impactTone(issue.impact)}>{IMPACT_PHRASE[issue.impact]}</Tag>
        <Tag tone={chip.tone}>{chip.text}</Tag>
      </div>
      <h3 id={headingId} className="text-base font-medium text-ink">
        {issue.title}
      </h3>
      <p className="text-sm text-ink-muted">{issue.problem}</p>
      <p className="text-xs text-ink-muted">
        {EFFORT_PHRASE[issue.effort]}
        {action?.status === "in_progress" && action.who && ` · ${STATUS_COLUMN.in_progress}`}
      </p>
      {action && (
        <p className="text-xs">
          <Link
            href={`/actions?product=${encodeURIComponent(product.id)}&status=all#action-${action.id}`}
            aria-label={`View on the Actions board: ${issue.title}`}
            className="rounded-sm text-accent underline underline-offset-2"
          >
            View on the Actions board
          </Link>
        </p>
      )}
      <TechnicalDetails
        id={`issue-${issue.id}`}
        topic={`${issue.title}: where it was found, the fix and the hand-off to Claude`}
      >
        <div className="flex flex-col gap-2">
          <p className="text-ink-muted">
            {AREAS[areaKeyOf(issue.area)].name}
            {" · "}
            {issue.total === 1 ? "Where" : `Where (${issue.total})`}
          </p>
          <ul className="flex flex-col gap-0.5 break-all font-mono text-ink-muted">
            {issue.locations.map((location) => (
              <li key={location}>{location}</li>
            ))}
            {more > 0 && <li>…and {more} more</li>}
          </ul>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-muted">Fix</dt>
            <dd>{issue.fix}</dd>
            <dt className="text-ink-muted">Done when</dt>
            <dd>{issue.check}</dd>
          </dl>
          <CopyPromptButton prompt={handoffPrompt(product, issue)} title={issue.title} />
        </div>
      </TechnicalDetails>
    </article>
  );
}
