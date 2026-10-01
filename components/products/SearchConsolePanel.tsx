import { DocsLink } from "@/components/ui/DocsLink";
import { Sparkline } from "@/components/ui/Sparkline";
import { DOCS_LINKS } from "@/lib/docs-links";
import type { SearchState } from "@/lib/scan/product-view";
import type { SearchSummary } from "@/lib/scan/search-summary";
import { SourcePanel } from "./SourcePanel";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

function Totals({ summary }: { summary: SearchSummary }) {
  const series = (key: "clicks" | "impressions") => summary.days.map((d) => d[key]);
  return (
    <dl className="grid h-fit grid-cols-2 gap-3">
      {(["clicks", "impressions"] as const).map((key) => (
        <div key={key}>
          <dt className="text-xs capitalize text-ink-muted">{key}</dt>
          <dd className="flex flex-col gap-1">
            <span className="font-serif text-2xl tabular-nums">{number.format(summary[key])}</span>
            {summary.days.length > 1 && (
              <Sparkline
                values={series(key)}
                label={`Daily ${key}, ${summary.startDate} to ${summary.endDate}`}
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

function TopQueries({ summary }: { summary: SearchSummary }) {
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
            <td className="py-1.5 text-right tabular-nums">{number.format(q.clicks)}</td>
            <td className="py-1.5 text-right tabular-nums">{number.format(q.impressions)}</td>
            <td className="py-1.5 text-right tabular-nums">{number.format(q.position)}</td>
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
export function SearchConsolePanel({ search }: { search: SearchState }) {
  if (search.state === "ok" && search.summary) {
    const { summary } = search;
    return (
      <SourcePanel id="search-console" title="Search Console" status="connected">
        <p className="text-xs text-ink-muted">
          {summary.startDate} to {summary.endDate} (Google's data lags about 3 days)
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
          <Totals summary={summary} />
          <TopQueries summary={summary} />
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
  return (
    <SourcePanel
      id="search-console"
      title="Search Console"
      status={search.state === "ok" ? "connected" : "not-connected"}
    >
      <p className="text-sm text-ink-muted">No Search Console data yet.</p>
      <p className="text-xs">
        <ConnectLink />
      </p>
    </SourcePanel>
  );
}
