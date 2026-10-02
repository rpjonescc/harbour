import type { ActionActor } from "./types";

type StatusEvent = { actor: ActionActor; from: string | null; to: string };

/**
 * Who made the latest status change in a history (oldest first): creation counts, a PR link (an
 * event from a status to itself) does not. Null when pruning left no status change. The same
 * rule as the SQL in active-work.ts; views.test.ts keeps the two in step.
 */
export function lastStatusActor(oldestFirst: readonly StatusEvent[]): ActionActor | null {
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    const event = oldestFirst[i];
    if (event && (event.from === null || event.from !== event.to)) return event.actor;
  }
  return null;
}
