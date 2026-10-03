import type { ActionActor } from "./types";

type StatusEvent = {
  actor: ActionActor;
  from: string | null;
  to: string;
  fromStage?: string | null;
  toStage?: string | null;
};

/**
 * The latest status change in a history (oldest first): creation and board moves count (a move
 * between two columns of one status changes only the stage), a PR link (an event from a status and
 * stage to themselves) does not. Null when pruning left no status change. The same rule as the SQL
 * in active-work.ts; views.test.ts keeps the two in step.
 */
export function latestStatusChange<T extends StatusEvent>(oldestFirst: readonly T[]): T | null {
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    const event = oldestFirst[i];
    if (!event) continue;
    const stageChanged = (event.fromStage ?? null) !== (event.toStage ?? null);
    if (event.from === null || event.from !== event.to || stageChanged) return event;
  }
  return null;
}

/** Who made the latest status change in a history (oldest first); null if pruning left none. */
export function lastStatusActor(oldestFirst: readonly StatusEvent[]): ActionActor | null {
  return latestStatusChange(oldestFirst)?.actor ?? null;
}
