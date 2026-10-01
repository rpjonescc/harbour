import type { ActionStatus } from "./types";

export type OwnerChange = { to: Exclude<ActionStatus, "suggested">; until?: string; note?: string };

/** The statuses the owner may move an action to, by its current status. */
const ALLOWED: Record<ActionStatus, readonly ActionStatus[]> = {
  suggested: ["open", "dismissed"],
  open: ["in_progress", "done", "snoozed", "dismissed"],
  in_progress: ["open", "done", "snoozed", "dismissed"],
  snoozed: ["open", "done", "dismissed"],
  done: ["open"],
  dismissed: ["open"],
};

const MAX_SNOOZE_DAYS = 365;
const DAY_MS = 86_400_000;

/** Days since the epoch for a strict, real `YYYY-MM-DD` date; null otherwise. */
function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Date.parse rolls impossible days over (2026-02-30 → March 2); refuse those.
  if (new Date(ms).toISOString().slice(0, 10) !== date) return null;
  return ms / DAY_MS;
}

function checkUntil(until: string, today: string): string | null {
  const day = dayNumber(until);
  const now = dayNumber(today);
  if (day === null || now === null) return "until_invalid";
  if (day <= now || day - now > MAX_SNOOZE_DAYS) return "until_invalid";
  return null;
}

/** Null when allowed, else a reason code: "not_allowed" | "until_required" | "until_invalid". */
export function checkTransition(
  from: ActionStatus,
  change: OwnerChange,
  today: string,
): string | null {
  if (!ALLOWED[from].includes(change.to)) return "not_allowed";
  if (change.to !== "snoozed") return change.until === undefined ? null : "until_invalid";
  if (change.until === undefined) return "until_required";
  return checkUntil(change.until, today);
}
