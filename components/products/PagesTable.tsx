import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { PageRow } from "@/lib/scan/page-rows";

function pathOf(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
}

/** Crawled pages with status, title and problems, the most troubled first. */
export function PagesTable({ rows, total }: { rows: PageRow[]; total: number }) {
  return (
    <section aria-labelledby="pages-heading" className="flex flex-col gap-3">
      <h2 id="pages-heading" className="font-serif text-xl">
        Pages
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No crawled pages yet.</p>
      ) : (
        <Panel className="overflow-x-auto px-4">
          <table className="w-full text-left text-sm">
            <caption className="py-2 text-left text-xs text-ink-muted">
              {rows.length < total
                ? `The ${rows.length} pages with the most problems, of ${total} crawled`
                : `${total} crawled ${total === 1 ? "page" : "pages"}, the most problems first`}
            </caption>
            <thead className="text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-normal">
                  Page
                </th>
                <th scope="col" className="w-16 py-2 pr-3 font-normal">
                  Status
                </th>
                <th scope="col" className="py-2 font-normal">
                  Problems
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
                    {row.title && <span className="block text-xs text-ink-muted">{row.title}</span>}
                  </td>
                  <td className={`py-2 pr-3 tabular-nums ${row.status >= 400 ? "text-bad" : ""}`}>
                    {row.status}
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
      )}
    </section>
  );
}
