import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { sourceName, sourceStatusPhrase } from "@/lib/explain/sources";
import { checkOutcome, NEXT_CHECK } from "@/lib/explain/sources-page";
import { formatDateTime } from "@/lib/format/date";
import type { ProductSources } from "@/lib/scan/sources-view";

/** One product's scan times and each source's latest run, with its error or reason. */
export function ProductSourcesTable({
  product,
  timeZone,
  locale,
}: {
  product: ProductSources;
  timeZone: string;
  locale: string;
}) {
  const at = (date: Date) => formatDateTime(date, timeZone, locale);
  const { lastScan, active } = product;
  const headingId = `sources-${product.productId}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="font-serif text-xl">
        <Link href={`/products/${product.productId}`} className="hover:text-accent">
          {product.name}
        </Link>
      </h2>
      <p className="text-xs text-ink-muted">
        {active
          ? `Check ${active.status === "running" ? "running" : "queued"} now`
          : lastScan
            ? `Last check ${at(lastScan.finishedAt ?? lastScan.startedAt)} (${checkOutcome(lastScan.status)})`
            : "Never checked"}{" "}
        · {NEXT_CHECK[product.next]}
      </p>
      <Panel className="overflow-x-auto px-4">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">{product.name}: each data source's latest run</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-normal">
                Source
              </th>
              <th scope="col" className="py-2 pr-3 font-normal">
                Status
              </th>
              <th scope="col" className="py-2 pr-3 font-normal">
                Last checked
              </th>
              <th scope="col" className="py-2 font-normal">
                More
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {product.runs.map((run) => (
              <tr key={run.collector} className="align-top">
                <th scope="row" className="py-2 pr-3 font-normal">
                  {sourceName(run.collector)}
                </th>
                <td className="py-2 pr-3">
                  {run.status ? (
                    <Tag tone={run.status === "failed" ? "warn" : "neutral"}>
                      {sourceStatusPhrase(run.collector, run.status)}
                    </Tag>
                  ) : (
                    <span className="text-xs text-ink-muted">Hasn't run yet</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-ink-muted">
                  {run.finishedAt ? at(run.finishedAt) : "—"}
                </td>
                <td className="py-2 text-xs text-ink-muted">
                  {run.error && (
                    <TechnicalDetails
                      id={`source-${product.productId}-${run.collector}`}
                      topic={`${product.name}: ${sourceName(run.collector)}`}
                    >
                      <p className="break-words">{run.error}</p>
                    </TechnicalDetails>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
