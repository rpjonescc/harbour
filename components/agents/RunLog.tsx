import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { RUN_LOG_TOPIC } from "@/lib/explain/agents";
import type { EventKind } from "@/lib/jobs/queue";
import type { RunEvent } from "./run-types";

const EVENT_TONE: Record<EventKind, string> = {
  error: "text-bad",
  tool: "text-ink-muted",
  status: "text-ink",
  text: "text-ink",
};

/** The step-by-step log of a run: raw event text, closed until the owner opens it. */
export function RunLog({ events, error }: { events: RunEvent[]; error: string | null }) {
  return (
    <TechnicalDetails id="run-log" topic={RUN_LOG_TOPIC}>
      {error && <p className="mb-2 break-words font-mono text-bad">{error}</p>}
      {events.length === 0 ? (
        <p className="text-ink-muted">No activity yet.</p>
      ) : (
        <ol aria-label="Run activity" className="flex flex-col gap-1 font-mono">
          {events.map((event) => (
            <li key={event.id} className={EVENT_TONE[event.kind]}>
              {event.text}
            </li>
          ))}
        </ol>
      )}
    </TechnicalDetails>
  );
}
