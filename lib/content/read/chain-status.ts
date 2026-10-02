import { desc, inArray } from "drizzle-orm";
import type { ContentKind } from "@/lib/content/limits";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

export type FailedStep = {
  kind: ContentKind;
  params: Record<string, string>;
  error: string | null;
};
const STEPS = ["content-draft", "content-atomise", "content-gate"] as const;
/** Newest step jobs looked at: bounds the read however long the jobs table has grown. */
const WINDOW = 400;
const CHECK_NAMES: Record<string, string> = {
  "no-ai-slop": "writing",
  humanizer: "humanizer",
  facts: "facts",
  platform: "platform",
};

/** The plain sentence for a step that did not finish (Decision 4: derived from the job, never written). */
export function stepSentence(kind: string, params: Record<string, string>): string {
  if (kind === "content-draft") return "The draft didn't finish. Try again.";
  if (kind === "content-atomise") return "The platform pieces didn't finish. Try again.";
  return `The ${CHECK_NAMES[params.gate ?? ""] ?? "last"} check didn't finish. Try again.`;
}

function recentSteps(db: Db) {
  return db
    .select()
    .from(jobs)
    .where(inArray(jobs.kind, [...STEPS]))
    .orderBy(desc(jobs.id))
    .limit(WINDOW)
    .all();
}

/** For each idea: whether a step is queued or running, and its newest step if that failed or was cancelled. */
export function ideaActivity(
  db: Db,
  ideaIds: readonly string[],
): Map<string, { active: boolean; failed: FailedStep | null }> {
  const out = new Map(
    ideaIds.map((id) => [id, { active: false, failed: null as FailedStep | null }]),
  );
  const seen = new Set<string>();
  for (const job of recentSteps(db)) {
    const entry = out.get(job.params.ideaId ?? "");
    if (!entry) continue;
    if (job.status === "queued" || job.status === "running") entry.active = true;
    // Only the newest job decides whether the chain is stuck: a later success clears an old failure.
    if (seen.has(job.params.ideaId ?? "")) continue;
    seen.add(job.params.ideaId ?? "");
    if (job.status === "failed" || job.status === "cancelled") {
      entry.failed = { kind: job.kind as ContentKind, params: job.params, error: job.error };
    }
  }
  return out;
}

/** The step "Try again" re-queues: the idea's newest content job, when it failed or was cancelled. */
export function latestFailedStep(db: Db, ideaId: string): FailedStep | null {
  return ideaActivity(db, [ideaId]).get(ideaId)?.failed ?? null;
}

/** The id of the idea's step that is queued or running, so a second click can answer with it. */
export function activeStepId(db: Db, ideaId: string): number | null {
  const active = recentSteps(db).find(
    (j) => j.params.ideaId === ideaId && (j.status === "queued" || j.status === "running"),
  );
  return active?.id ?? null;
}
