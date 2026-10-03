// What the outside-view rules judge: the product's recent history, built from stored checks.
// Pure (no database): `readOutsideFacts` in lib/external/read-facts.ts gathers the rows.
import type { AiAnswer, Backlinks } from "@/lib/scan/treg-shapes";

const DAY_MS = 24 * 60 * 60_000;
/** The AI checks the rule looks at: the last two weekly checks, about 14 days. */
export const AI_WINDOW_DAYS = 14;

type At<T> = { subject: string; checkedAt: Date; value: T };

/** One weekly (or manual) AI check: every question asked at one moment. */
export type AiRun = {
  checkedAt: string;
  answers: { question: string; named: boolean; cited: boolean }[];
};

export type OutsideFacts = {
  /** The latest links check; null when there has not been one. */
  backlinks: { subject: string; referringDomains: number; checkedAt: string } | null;
  /** AI checks within 14 days of the latest one, newest first; empty when there are none. */
  aiRuns: AiRun[];
};

/** Facts from stored checks, each list newest first. */
export function buildOutsideFacts(
  backlinks: readonly At<Backlinks>[],
  ai: readonly At<AiAnswer>[],
): OutsideFacts {
  const [latest] = backlinks;
  const newest = ai[0]?.checkedAt.getTime();
  const runs = new Map<number, AiRun>();
  for (const row of ai) {
    const at = row.checkedAt.getTime();
    if (newest === undefined || newest - at > AI_WINDOW_DAYS * DAY_MS) continue;
    const run = runs.get(at) ?? { checkedAt: row.checkedAt.toISOString(), answers: [] };
    const { question, named, cited } = row.value;
    run.answers.push({ question, named, cited });
    runs.set(at, run);
  }
  return {
    backlinks: latest
      ? {
          subject: latest.subject,
          referringDomains: latest.value.referringDomains,
          checkedAt: latest.checkedAt.toISOString(),
        }
      : null,
    aiRuns: [...runs.values()],
  };
}
