import { Panel } from "@/components/ui/Panel";
import type { RuleActionStatus } from "@/lib/actions/views";
import type { Product } from "@/lib/products/catalog";
import type { Issue } from "@/lib/scan/issues";
import { IssueItem } from "./IssueItem";

/**
 * The scan's issues, highest impact first, each with its action's status; `scanned` tells
 * "none found" from "not scanned".
 */
export function IssueList({
  issues,
  actionByRule,
  product,
  scanned,
  locale,
}: {
  issues: Issue[];
  actionByRule: Map<string, RuleActionStatus>;
  product: Product;
  scanned: boolean;
  locale: string;
}) {
  return (
    <section
      id="issues"
      aria-labelledby="issues-heading"
      className="flex scroll-mt-8 flex-col gap-3"
    >
      <h2 id="issues-heading" className="font-serif text-xl">
        Issues
      </h2>
      {issues.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {scanned ? "No issues found in the last scan." : "Issues appear after the first scan."}
        </p>
      ) : (
        <Panel className="px-4">
          <ul className="divide-y divide-line">
            {issues.map((issue) => (
              <li key={issue.id}>
                <IssueItem
                  issue={issue}
                  action={actionByRule.get(issue.id) ?? null}
                  product={product}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
