import { CopyPromptButton } from "@/components/ui/CopyPromptButton";
import { Tag } from "@/components/ui/Tag";
import type { Product } from "@/lib/products/catalog";
import { handoffPrompt } from "@/lib/scan/handoff";
import type { Issue } from "@/lib/scan/issues";

const IMPACT = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

/** One issue: what is wrong, where, the fix, how to tell it is done, and the hand-off. */
export function IssueItem({ issue, product }: { issue: Issue; product: Product }) {
  const headingId = `issue-${issue.id}`;
  const more = issue.total - issue.locations.length;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap gap-1.5">
        <Tag tone={issue.impact === "high" ? "warn" : "neutral"}>{IMPACT[issue.impact]}</Tag>
        <Tag tone="accent">{issue.area}</Tag>
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
      <CopyPromptButton prompt={handoffPrompt(product, issue)} title={issue.title} />
    </article>
  );
}
