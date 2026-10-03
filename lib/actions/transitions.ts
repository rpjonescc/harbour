import { isIsoDay, parseDay } from "@/lib/format/iso-day";
import type { ActionStatus } from "./types";

export type StatusChange = {
  to: Exclude<ActionStatus, "suggested">;
  until?: string;
  note?: string;
};

/** The statuses the owner may move an action to, by its current status. */
const ALLOWED: Record<ActionStatus, readonly ActionStatus[]> = {
  suggested: ["open", "dismissed"],
  open: ["in_progress", "done", "snoozed", "dismissed"],
  in_progress: ["open", "done", "snoozed", "dismissed"],
  snoozed: ["open", "done", "dismissed"],
  done: ["open"],
  dismissed: ["open"],
};

/** Furthest a snooze may reach, in days from today. */
export const MAX_SNOOZE_DAYS = 365;
const DAY_MS = 86_400_000;

/** Days since the epoch for a strict, real `YYYY-MM-DD` date; null otherwise. */
function dayNumber(date: string): number | null {
  return isIsoDay(date) ? parseDay(date) / DAY_MS : null;
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
  change: StatusChange,
  today: string,
): string | null {
  if (!ALLOWED[from].includes(change.to)) return "not_allowed";
  if (change.to !== "snoozed") return change.until === undefined ? null : "until_invalid";
  if (change.until === undefined) return "until_required";
  return checkUntil(change.until, today);
}
