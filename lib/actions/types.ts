import type { actions } from "@/lib/db/schema";

export type ActionStatus = "suggested" | "open" | "in_progress" | "done" | "snoozed" | "dismissed";
export type ActionActor = "owner" | "scan" | "agent" | "system";
/** One piece of evidence; `url` is set only for http(s) links. */
export type EvidenceItem = { text: string; url: string | null };
/** Bounded evidence: `items` is capped, `total` counts everything that was found. */
export type Evidence = { items: EvidenceItem[]; total: number };
export type ActionRow = typeof actions.$inferSelect;
export type NewAction = Omit<
  typeof actions.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "statusChangedAt" | "titleKey"
>;
/** Statuses the owner is actively working on. */
export const ACTIVE: readonly ActionStatus[] = ["open", "in_progress"];
