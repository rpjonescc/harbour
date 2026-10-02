import { Sparkline } from "@/components/ui/Sparkline";
import type { SearchSummary } from "@/lib/scan/search-summary";

type Format = (value: number) => string;

/** Formats numbers the way the owner's locale writes them. */
export const numberFormat = (locale: string): Format =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format;

const LABEL = { clicks: "Visits from Google", impressions: "Times shown in search" } as const;
const CHART = { clicks: "visits from Google", impressions: "times shown in search" } as const;

export function Totals({
  summary,
  number,
  period,
}: {
  summary: SearchSummary;
  number: Format;
  period: string;
}) {
  const series = (key: "clicks" | "impressions") => summary.days.map((d) => d[key]);
  return (
    <dl className="grid h-fit grid-cols-2 gap-3">
      {(["clicks", "impressions"] as const).map((key) => (
        <div key={key}>
          <dt className="text-xs text-ink-muted">{LABEL[key]}</dt>
          <dd className="flex flex-col gap-1">
            <span className="font-serif text-2xl tabular-nums">{number(summary[key])}</span>
            {summary.days.length > 1 && (
              <Sparkline
                values={series(key)}
                label={`Daily ${CHART[key]}, ${period}`}
                width={120}
                height={28}
              />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TopQueries({ summary, number }: { summary: SearchSummary; number: Format }) {
  if (summary.topQueries.length === 0) {
    return <p className="text-xs text-ink-muted">No searches in this window.</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Top searches by clicks</caption>
      <thead className="text-ink-muted">
        <tr className="border-b border-line">
          <th scope="col" className="py-1.5 font-normal">
            Search
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Clicks
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Times shown
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Average position
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {summary.topQueries.map((q) => (
          <tr key={q.query}>
            <th scope="row" className="py-1.5 pr-2 font-normal break-all">
              {q.query}
            </th>
            <td className="py-1.5 text-right tabular-nums">{number(q.clicks)}</td>
            <td className="py-1.5 text-right tabular-nums">{number(q.impressions)}</td>
            <td className="py-1.5 text-right tabular-nums">{number(q.position)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
