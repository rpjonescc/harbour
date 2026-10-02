import { EmptyState } from "@/components/explain/EmptyState";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { pageResult, pagesSummary } from "@/lib/explain/pages";
import type { PageRow } from "@/lib/scan/page-rows";

function pathOf(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
}

/**
 * A one-line verdict on the crawled pages; the full table, most troubled first, sits in
 * Technical details.
 */
export function PagesTable({ rows, total }: { rows: PageRow[]; total: number }) {
  return (
    <section aria-labelledby="pages-heading" className="flex flex-col gap-3">
      <h2 id="pages-heading" className="font-serif text-xl">
        Pages Harbour checked
      </h2>
      {rows.length === 0 ? (
        <EmptyState
          what="The pages Harbour checks will be listed here."
          when="They appear after the first scan finishes."
          why="Each shows whether it loaded and anything to fix on it."
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">{pagesSummary(rows, total)}</p>
          <TechnicalDetails id="product-pages" topic="every page Harbour checked">
            <Panel className="overflow-x-auto px-4">
              <table className="w-full text-left text-sm">
                <caption className="py-2 text-left text-xs text-ink-muted">
                  {rows.length < total
                    ? `The ${rows.length} pages with the most to fix, of ${total} checked`
                    : "Pages Harbour checked, the most to fix first"}
                </caption>
                <thead className="text-xs text-ink-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3 font-normal">
                      Page
                    </th>
                    <th scope="col" className="py-2 pr-3 font-normal">
                      Result
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      What to fix
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.url} className="align-top">
                      <td className="py-2 pr-3">
                        <a
                          href={row.url}
                          className="break-all font-mono text-xs hover:text-accent hover:underline"
                        >
                          {pathOf(row.url)}
                        </a>
                        {row.title && (
                          <span className="block text-xs text-ink-muted">{row.title}</span>
                        )}
                      </td>
                      <td className={`py-2 pr-3 ${row.status >= 400 ? "text-bad" : ""}`}>
                        {pageResult(row.status)}
                      </td>
                      <td className="py-2">
                        {row.problems.length === 0 ? (
                          <span className="text-xs text-ink-muted">None</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {row.problems.map((problem) => (
                              <Tag key={problem} tone="warn">
                                {problem}
                              </Tag>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </TechnicalDetails>
        </>
      )}
    </section>
  );
}
