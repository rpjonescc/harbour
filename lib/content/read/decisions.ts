import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

/** What the owner's decisions are doing: waiting ones (the page says "Saving") and ones that failed. */
export type DecisionStatus = {
  saving: ReadonlySet<string>;
  /** The newest decision per target, when it failed: the sentence, and the revision it was asked at. */
  failed: ReadonlyMap<string, { error: string; revision: string | null; fromState: string | null }>;
};

/** Only the newest jobs are looked at: a decision no longer among them has long been settled. */
const RECENT_DECISIONS = 200;

/**
 * Reads the newest decision job per piece or idea. A queued or running one means "Saving"; a
 * failed one is shown with its own sentence until a newer decision replaces it. Reads only.
 */
export function decisionStatus(db: Db): DecisionStatus {
  const rows = db
    .select({ params: jobs.params, status: jobs.status, error: jobs.error })
    .from(jobs)
    .where(eq(jobs.kind, "content-decision"))
    .orderBy(desc(jobs.id))
    .limit(RECENT_DECISIONS)
    .all();
  const saving = new Set<string>();
  const failed = new Map<
    string,
    { error: string; revision: string | null; fromState: string | null }
  >();
  const seen = new Set<string>();
  for (const { params, status, error } of rows) {
    const target = params.pieceId ?? params.ideaId;
    if (!target) continue;
    if (status === "queued" || status === "running") saving.add(target);
    if (seen.has(target)) continue;
    seen.add(target);
    if (status === "failed" && error) {
      failed.set(target, {
        error,
        revision: params.revision ?? null,
        fromState: params.fromState ?? null,
      });
    }
  }
  return { saving, failed };
}
