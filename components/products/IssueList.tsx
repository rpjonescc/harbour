import { Panel } from "@/components/ui/Panel";
import type { Product } from "@/lib/products/catalog";
import type { Issue } from "@/lib/scan/issues";
import { IssueItem } from "./IssueItem";

/** The scan's issues, highest impact first; `scanned` tells "none found" from "not scanned". */
export function IssueList({
  issues,
  product,
  scanned,
}: {
  issues: Issue[];
  product: Product;
  scanned: boolean;
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
                <IssueItem issue={issue} product={product} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
