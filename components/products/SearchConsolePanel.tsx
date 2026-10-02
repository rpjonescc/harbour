import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { DOCS_LINKS } from "@/lib/docs-links";
import { searchSummarySentence } from "@/lib/explain/search-console";
import { sourceExplanation, sourceName, sourceStatusPhrase } from "@/lib/explain/sources";
import { formatIsoDay } from "@/lib/format/date";
import type { SearchState } from "@/lib/scan/product-view";
import type { SearchSummary } from "@/lib/scan/search-summary";
import { numberFormat, TopQueries, Totals } from "./SearchConsoleNumbers";
import { SourcePanel } from "./SourcePanel";

const ID = "search-console";
const TITLE = sourceName(ID);
const MISSING_NOT_ZERO = "Until it is, these numbers are missing, not zero.";

/** The raw reason Harbour recorded (setting names, API errors): only under Technical details. */
function Raw({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <TechnicalDetails id="search-console-reason" topic="what Harbour recorded">
      <p>{reason}</p>
    </TechnicalDetails>
  );
}

function ConnectLink() {
  return (
    <p className="text-xs">
      <DocsLink href={DOCS_LINKS.searchConsole}>How to connect {TITLE}</DocsLink>
    </p>
  );
}

function ConnectedBody({ summary, locale }: { summary: SearchSummary; locale: string }) {
  const number = numberFormat(locale);
  const period = `${formatIsoDay(summary.startDate, locale)} to ${formatIsoDay(summary.endDate, locale)}`;
  return (
    <>
      <p className="text-base text-ink">
        {searchSummarySentence(summary.clicks, summary.impressions, number)}
      </p>
      <p className="text-xs text-ink-muted">{period} (Google's numbers run about 3 days behind)</p>
      <Totals summary={summary} number={number} period={period} />
      <TechnicalDetails id="search-console-queries" topic="top searches in numbers">
        <TopQueries summary={summary} number={number} />
      </TechnicalDetails>
    </>
  );
}

/** What Google showed and how many clicked over the scan's 28 days, or why there is nothing yet. */
export function SearchConsolePanel({ search, locale }: { search: SearchState; locale: string }) {
  if (search.state === "ok" && search.summary) {
    return (
      <SourcePanel
        id={ID}
        title={TITLE}
        status="connected"
        statusLabel={sourceStatusPhrase(ID, "ok")}
      >
        <ConnectedBody summary={search.summary} locale={locale} />
      </SourcePanel>
    );
  }
  if (search.state === "ok") {
    return (
      <SourcePanel
        id={ID}
        title={TITLE}
        status="connected"
        statusLabel={sourceStatusPhrase(ID, "ok")}
      >
        <p className="text-sm text-ink-muted">
          Connected, but Google sent no search data for this scan. That is normal for a new site.
        </p>
      </SourcePanel>
    );
  }
  if (search.state === "failed") {
    return (
      <SourcePanel id={ID} title={TITLE} status="failed" statusLabel="Needs a look">
        <p className="text-sm text-ink">
          {sourceStatusPhrase(ID, "failed")}. Harbour will try again with the next scan.{" "}
          {MISSING_NOT_ZERO}
        </p>
        <ConnectLink />
        <Raw reason={search.reason} />
      </SourcePanel>
    );
  }
  // not_configured, skipped or never run: connect it to get the numbers.
  return (
    <SourcePanel
      id={ID}
      title={TITLE}
      status="not-connected"
      statusLabel={sourceStatusPhrase(ID, "not_configured")}
    >
      <p className="text-sm text-ink-muted">{sourceExplanation(ID)?.gives}</p>
      <p className="text-xs text-ink-muted">{MISSING_NOT_ZERO}</p>
      <ConnectLink />
      <Raw reason={search.state === "none" ? null : search.reason} />
    </SourcePanel>
  );
}
