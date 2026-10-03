import { useId } from "react";
import { Explainer } from "@/components/explain/Explainer";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import {
  checkingLine,
  INDEX_STATE_NAMES,
  INDEXING_EMPTY,
  INDEXING_ONE_LINER,
  INDEXING_PARTS,
  inGoogleLine,
} from "@/lib/explain/indexing";
import { formatIsoDay } from "@/lib/format/date";
import { INDEX_STATES } from "@/lib/scan/index-shapes";
import type { IndexingState } from "@/lib/scan/indexing-view";

const TITLE = "Pages in Google";

type Counted = Extract<IndexingState, { state: "counted" }>;

function Breakdown({ counted, locale }: { counted: Counted; locale: string }) {
  const since = counted.checkedThrough?.slice(0, 10);
  return (
    <TechnicalDetails id="indexing-breakdown" topic="pages by what Google says">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Pages by what Google says about them</caption>
        <tbody className="divide-y divide-line">
          {INDEX_STATES.map((state) => (
            <tr key={state}>
              <th scope="row" className="py-1.5 pr-2 font-normal">
                {INDEX_STATE_NAMES[state]}
              </th>
              <td className="py-1.5 text-right tabular-nums">{counted.byState[state] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {since && (
        <p className="mt-2 text-xs text-ink-muted">
          The oldest of these checks was on {formatIsoDay(since, locale)}.
        </p>
      )}
    </TechnicalDetails>
  );
}

function CountedBody({ counted, locale }: { counted: Counted; locale: string }) {
  const done = counted.checked >= counted.total;
  const line = done
    ? inGoogleLine(counted.indexed, counted.total)
    : checkingLine(counted.checked, counted.total);
  return (
    <>
      <p className="font-serif text-2xl">{line}</p>
      {!done && counted.checked > 0 && (
        <p className="text-sm text-ink-muted">
          So far, {counted.indexed} of the {counted.checked} pages checked{" "}
          {counted.indexed === 1 ? "is" : "are"} in Google.
        </p>
      )}
      <Breakdown counted={counted} locale={locale} />
    </>
  );
}

function EmptyBody({ state }: { state: Extract<IndexingState, { state: "empty" }> }) {
  const message = {
    not_connected: INDEXING_EMPTY.notConnected,
    no_sitemap: INDEXING_EMPTY.noSitemap,
    failed: INDEXING_EMPTY.failed,
    waiting: INDEXING_EMPTY.waiting,
  }[state.why];
  return (
    <>
      <p className="text-sm text-ink">{message}</p>
      {state.reason && (
        <TechnicalDetails id="indexing-reason" topic="what Harbour recorded">
          <p>{state.reason}</p>
        </TechnicalDetails>
      )}
    </>
  );
}

/**
 * How many of the sitemap's pages Google has added to its search results, unscored, or why that
 * isn't known yet. Never shows a count it doesn't have.
 */
export function IndexingPanel({ indexing, locale }: { indexing: IndexingState; locale: string }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4"
    >
      <h2 id={headingId} className="font-serif text-lg">
        {TITLE}
      </h2>
      {indexing.state === "counted" ? (
        <CountedBody counted={indexing} locale={locale} />
      ) : (
        <EmptyBody state={indexing} />
      )}
      <Explainer topic={TITLE} oneLiner={INDEXING_ONE_LINER} parts={INDEXING_PARTS} />
    </section>
  );
}
