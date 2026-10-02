import { EmptyState } from "@/components/explain/EmptyState";
import { Panel } from "@/components/ui/Panel";
import type { RuleActionStatus } from "@/lib/actions/views";
import type { Product } from "@/lib/products/catalog";
import type { Issue } from "@/lib/scan/issues";
import { IssueItem } from "./IssueItem";

const NONE_FOUND = {
  what: "No problems found in the last check.",
  when: "Harbour looks again at the next check.",
  why: "Anything new it finds appears here and on the Actions board.",
};

const NOT_SCANNED = {
  what: "Problems Harbour finds will be listed here.",
  when: "They appear after the first check finishes.",
  why: "Each comes with what to do about it and how to tell it's fixed.",
};

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
        What to fix
      </h2>
      {issues.length > 0 && (
        <p className="text-sm text-ink-muted">
          Each problem says why it matters, and the same list is tracked on the Actions board.
        </p>
      )}
      {issues.length === 0 ? (
        <EmptyState {...(scanned ? NONE_FOUND : NOT_SCANNED)} />
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
