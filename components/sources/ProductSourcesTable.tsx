import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { formatDateTime } from "@/lib/format/date";
import type { NextDailyScan } from "@/lib/jobs/scan-schedule";
import { collectorLabel } from "@/lib/scan/labels";
import type { ProductSources, SourceRun } from "@/lib/scan/sources-view";

const STATUS: Record<
  NonNullable<SourceRun["status"]>,
  { text: string; tone: "accent" | "warn" | "neutral" }
> = {
  ok: { text: "ok", tone: "accent" },
  failed: { text: "failed", tone: "warn" },
  not_configured: { text: "not connected", tone: "neutral" },
  skipped: { text: "skipped", tone: "neutral" },
};

const NEXT: Record<NextDailyScan, string> = {
  off: "Next check: only when you choose Check now",
  today: "Next check: today at 06:00",
  tomorrow: "Next check: tomorrow at 06:00",
  due: "Next check: due now — queued at the worker's next check",
};

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
            ? `Last check ${at(lastScan.finishedAt ?? lastScan.startedAt)} (${lastScan.status})`
            : "Never checked"}{" "}
        · {NEXT[product.next]}
      </p>
      <Panel className="overflow-x-auto px-4">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">{product.name}: each source's latest run</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-normal">
                Source
              </th>
              <th scope="col" className="py-2 pr-3 font-normal">
                Last status
              </th>
              <th scope="col" className="py-2 pr-3 font-normal">
                Last run
              </th>
              <th scope="col" className="py-2 font-normal">
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {product.runs.map((run) => (
              <tr key={run.collector} className="align-top">
                <th scope="row" className="py-2 pr-3 font-normal">
                  {collectorLabel(run.collector)}
                </th>
                <td className="py-2 pr-3">
                  {run.status ? (
                    <Tag tone={STATUS[run.status].tone}>{STATUS[run.status].text}</Tag>
                  ) : (
                    <span className="text-xs text-ink-muted">never ran</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-ink-muted">
                  {run.finishedAt ? at(run.finishedAt) : "—"}
                </td>
                <td className="py-2 text-xs break-words text-ink-muted">{run.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
