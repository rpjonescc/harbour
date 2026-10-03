import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { linkChange, linkingLine, namedLine, positionText } from "@/lib/explain/outside";
import { formatIsoDay } from "@/lib/format/date";
import type { OutsideView, SearchRow } from "@/lib/scan/outside-view";

const CHANGE_WORDS = {
  up: "Up",
  down: "Down",
  same: "Same as last time",
  first: "First check",
} as const;

/** How a search moved since the check before, in words (a position is never invented). */
function searchChange(row: SearchRow): string {
  if (row.change === null) return "";
  if (row.change === "first" || row.change === "same" || row.before === null) {
    return CHANGE_WORDS[row.change];
  }
  return `${CHANGE_WORDS[row.change]} from ${positionText(row.before.position).toLowerCase()}`;
}

/** The numbers: sites linking to you, each search's position and the AI check. Plain text only. */
export function OutsideFindings({
  view,
  locale,
  idPrefix,
}: {
  view: OutsideView;
  locale: string;
  idPrefix: string;
}) {
  const { links, searches, ai } = view;
  const change = links ? linkChange(links.change) : null;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-serif text-2xl">
          {links ? linkingLine(links.count) : "Links to you: not checked yet"}
        </p>
        {change && <p className="text-sm text-ink-muted">{change}</p>}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">Your position on Google</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {searches.map((row) => (
            <li key={row.query} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="break-words">{row.query}</span>
              <span className="text-ink-muted">
                {row.checked ? (
                  <>
                    <strong className="font-medium text-ink">{positionText(row.position)}</strong>
                    {searchChange(row) && ` · ${searchChange(row)}`}
                  </>
                ) : (
                  "Not checked yet"
                )}
              </span>
            </li>
          ))}
          {searches.length === 0 && <li className="text-ink-muted">No searches chosen yet</li>}
        </ul>
      </div>
      <div>
        <p className="text-sm font-medium text-ink">Does ChatGPT mention you?</p>
        {ai ? (
          <p className="text-sm">
            {namedLine(ai.named, ai.asked)}
            {ai.domains.length > 0 && `; sites it cited most: ${ai.domains.join(", ")}`}.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Not checked yet</p>
        )}
      </div>
      {view.checkedAt && (
        <p className="text-xs text-ink-muted">
          Last checked {formatIsoDay(view.checkedAt.slice(0, 10), locale)}.
        </p>
      )}
      <TechnicalDetails id={`${idPrefix}-details`} topic="the checks behind these numbers">
        <ul className="flex flex-col gap-1">
          {links && (
            <li>
              Sites linking to you: {links.count}, checked {links.checkedAt.slice(0, 10)}.
            </li>
          )}
          {searches.map((row) => (
            <li key={row.query} className="break-all">
              {row.query}: {row.checked ? positionText(row.position) : "not checked"}
              {row.url ? ` at ${row.url}` : ""}
            </li>
          ))}
          {ai && (
            <li>
              ChatGPT: named in {ai.named} and linked to you in {ai.cited} of {ai.asked} answers,
              checked {ai.checkedAt.slice(0, 10)}.
            </li>
          )}
        </ul>
      </TechnicalDetails>
    </div>
  );
}
