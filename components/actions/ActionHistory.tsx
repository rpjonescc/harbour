import type { ActionStatus } from "@/lib/actions/types";
import type { ActionEventView } from "@/lib/actions/views";
import { formatDateTime } from "@/lib/format/date";
import { ACTOR_LABEL, STATUS_LABEL } from "./action-labels";

/** The status move; none for an entry that kept the status (a linked pull request). */
function change({ from, to }: ActionEventView): string[] {
  // Stored statuses are the schema's enum; the cast only narrows the column type.
  const label = (status: string) => STATUS_LABEL[status as ActionStatus] ?? status;
  if (from === null) return [`created as ${label(to)}`];
  return from === to ? [] : [`${label(from)} → ${label(to)}`];
}

/** An action's status changes, oldest first: when, who, from → to and the note. */
export function ActionHistory({
  events,
  truncated,
  timeZone,
  locale,
}: {
  events: ActionEventView[];
  truncated: boolean;
  timeZone: string;
  locale: string;
}) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer rounded-sm text-accent">History</summary>
      {truncated && <p className="mt-1 text-ink-muted">Older history pruned.</p>}
      <ol className="mt-1 flex flex-col gap-0.5 text-ink-muted">
        {events.map((event, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: events are append-only, so position is stable
          <li key={index}>
            {[
              formatDateTime(event.at, timeZone, locale),
              ACTOR_LABEL[event.actor],
              ...change(event),
              ...(event.note ? [event.note] : []),
            ].join(" · ")}
          </li>
        ))}
      </ol>
    </details>
  );
}
