import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";

// Single-line plain text: control and invisible format characters (newlines, zero-width, bidi
// overrides) are refused so a pillar can't smuggle structure into a later prompt or label.
const plainLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // Also look-alike blanks: any space separator but U+0020, Hangul filler and braille blank.
    .refine(
      (v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}   -   　ㅤ⠀]/u.test(v),
      "must be plain text on one line",
    );

/** A pillar proposal's own fields; the proposals schema adds the shared `why`. */
export const pillarFields = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(40),
  name: plainLine(60),
  description: plainLine(300),
});

/** Most pillars a product may have approved at once: the owner rejects one to make room. */
export const MAX_APPROVED_PILLARS = 6;
export type Pillar = z.infer<typeof pillarFields>;

const pillarRows = (db: Db, productId: string) =>
  db
    .select()
    .from(proposals)
    .where(and(eq(proposals.productId, productId), eq(proposals.type, "pillar")))
    .orderBy(asc(proposals.id))
    .all();

/** The pillars the owner approved, oldest first: what ideas are shaped by. */
export function approvedPillars(db: Db, productId: string): Pillar[] {
  return pillarRows(db, productId)
    .filter((row) => row.status === "approved")
    .flatMap(({ value }) =>
      // A row without a valid key is skipped rather than shown as an unnamed pillar.
      value.key && value.name && value.description
        ? [{ key: value.key, name: value.name, description: value.description }]
        : [],
    );
}

/**
 * Whether approving would take a product past six approved pillars (the owner must reject one
 * first). Count and update run synchronously in one process (SQLite), so nothing can slip between.
 */
export function pillarLimitReached(
  db: Db,
  productId: string,
  action: { action: string; type?: string; proposalId?: number },
): boolean {
  const rows = pillarRows(db, productId);
  const approved = approvedPillars(db, productId).length;
  if (action.action === "approve-all" && action.type === "pillar") {
    const proposed = rows.filter((p) => p.status === "proposed").length;
    return approved + proposed > MAX_APPROVED_PILLARS;
  }
  if (action.action !== "approve" || action.proposalId === undefined) return false;
  const row = rows.find((p) => p.id === action.proposalId);
  // A rejected pillar counts as new too: re-approving it must not slip past the cap.
  return row !== undefined && row.status !== "approved" && approved >= MAX_APPROVED_PILLARS;
}
