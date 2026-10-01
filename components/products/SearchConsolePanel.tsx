import { DocsLink } from "@/components/ui/DocsLink";
import { Sparkline } from "@/components/ui/Sparkline";
import { DOCS_LINKS } from "@/lib/docs-links";
import { formatIsoDay } from "@/lib/format/date";
import type { SearchState } from "@/lib/scan/product-view";
import type { SearchSummary } from "@/lib/scan/search-summary";
import { SourcePanel } from "./SourcePanel";

type Format = (value: number) => string;

const numberFormat = (locale: string): Format =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format;

function Totals({
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
          <dt className="text-xs capitalize text-ink-muted">{key}</dt>
          <dd className="flex flex-col gap-1">
            <span className="font-serif text-2xl tabular-nums">{number(summary[key])}</span>
            {summary.days.length > 1 && (
              <Sparkline
                values={series(key)}
                label={`Daily ${key}, ${period}`}
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

function TopQueries({ summary, number }: { summary: SearchSummary; number: Format }) {
  if (summary.topQueries.length === 0) {
    return <p className="text-xs text-ink-muted">No queries in this window.</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Top queries by clicks</caption>
      <thead className="text-ink-muted">
        <tr className="border-b border-line">
          <th scope="col" className="py-1.5 font-normal">
            Query
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Clicks
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Impr.
          </th>
          <th scope="col" className="py-1.5 text-right font-normal">
            Pos.
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

function ConnectLink() {
  return <DocsLink href={DOCS_LINKS.searchConsole}>How to connect Search Console</DocsLink>;
}

/** Clicks and impressions over the scan's 28-day window and the top queries, or why there are none. */
export function SearchConsolePanel({ search, locale }: { search: SearchState; locale: string }) {
  if (search.state === "ok" && search.summary) {
    const { summary } = search;
    const number = numberFormat(locale);
    const period = `${formatIsoDay(summary.startDate, locale)} to ${formatIsoDay(summary.endDate, locale)}`;
    return (
      <SourcePanel id="search-console" title="Search Console" status="connected">
        <p className="text-xs text-ink-muted">{period} (Google's data lags about 3 days)</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
          <Totals summary={summary} number={number} period={period} />
          <TopQueries summary={summary} number={number} />
        </div>
      </SourcePanel>
    );
  }
  if (search.state === "failed") {
    return (
      <SourcePanel id="search-console" title="Search Console" status="failed">
        <p className="text-sm text-ink">
          Failed in the last scan{search.reason ? `: ${search.reason}` : "."}
        </p>
        <p className="text-xs">
          <ConnectLink />
        </p>
      </SourcePanel>
    );
  }
  if (search.state === "not_configured") {
    return (
      <SourcePanel id="search-console" title="Search Console" status="not-connected">
        <p className="text-sm text-ink-muted">{search.reason ?? "Not connected."}</p>
        <p className="text-xs">
          <ConnectLink />
        </p>
      </SourcePanel>
    );
  }
  if (search.state === "ok") {
    // It ran and connected but stored no summary: nothing to set up.
    return (
      <SourcePanel id="search-console" title="Search Console" status="connected">
        <p className="text-sm text-ink-muted">No Search Console data in this scan.</p>
      </SourcePanel>
    );
  }
  return (
    <SourcePanel id="search-console" title="Search Console" status="not-connected">
      <p className="text-sm text-ink-muted">No Search Console data yet.</p>
      <p className="text-xs">
        <ConnectLink />
      </p>
    </SourcePanel>
  );
}
