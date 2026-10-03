import type { actions } from "@/lib/db/schema";

export type ActionStatus = "suggested" | "open" | "in_progress" | "done" | "snoozed" | "dismissed";
/** Board stages an open or in-progress action can sit in; null stage is the status's default column. */
export const ACTION_STAGES = ["queue", "started", "in_review"] as const;
export type ActionStage = (typeof ACTION_STAGES)[number];
/** Everyone who can change an action; the history table's actor column uses this list. */
export const ACTION_ACTORS = ["owner", "claude", "scan", "agent", "system"] as const;
export type ActionActor = (typeof ACTION_ACTORS)[number];
/** One piece of evidence; `url` is set only for http(s) links. */
export type EvidenceItem = { text: string; url: string | null };
/** Bounded evidence: `items` is capped, `total` counts everything that was found. */
export type Evidence = { items: EvidenceItem[]; total: number };
export type ActionRow = typeof actions.$inferSelect;
export type NewAction = Omit<
  typeof actions.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "statusChangedAt" | "titleKey" | "prUrl"
>;
/** What an action says: its content, apart from where it came from and its status. */
export type ActionFields = Pick<
  NewAction,
  "area" | "title" | "why" | "fix" | "check" | "impact" | "effort" | "evidence" | "docs"
>;
/** Every status, in the order an action usually moves through them. */
export const ACTION_STATUSES: readonly ActionStatus[] = [
  "suggested",
  "open",
  "in_progress",
  "done",
  "snoozed",
  "dismissed",
];
/** Statuses the owner is actively working on. */
export const ACTIVE: readonly ActionStatus[] = ["open", "in_progress"];
