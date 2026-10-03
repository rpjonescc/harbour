// The tower's one freshness rule (spec §5): how old a time is against how often it should come.
// Pure: no I/O, no clock of its own.

import type { LightTone } from "@/lib/explain/tower";

export type Freshness = "fresh" | "late" | "stale" | "never";

export type FreshnessRule = {
  everyMs: number;
  graceMs: number;
  /** Past this age the tone is `act` (needs the owner); without it, late and stale are `watch`. */
  actAfterMs?: number;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Spec §5's table. Backup and the daily note keep their own health rules for the tone. */
export const FRESHNESS_RULES = {
  workerBeat: { everyMs: 30 * SECOND, graceMs: 90 * SECOND, actAfterMs: 10 * MINUTE },
  dailyCheck: { everyMs: DAY, graceMs: 2 * HOUR, actAfterMs: 50 * HOUR },
  backup: { everyMs: DAY, graceMs: 2 * HOUR },
  dailyNote: { everyMs: DAY, graceMs: HOUR },
  weeklyRun: { everyMs: 7 * DAY, graceMs: 6 * HOUR },
  monthlyRefresh: { everyMs: 31 * DAY, graceMs: DAY },
} as const satisfies Record<string, FreshnessRule>;

/**
 * `fresh` while the age is at most every + grace, `late` up to twice that, `stale` beyond, and
 * `never` when there is no time at all (a gap, never fresh). A time ahead of `now` is fresh.
 */
export function freshness(at: Date | null, now: Date, rule: FreshnessRule): Freshness {
  if (at === null) return "never";
  const age = now.getTime() - at.getTime();
  const due = rule.everyMs + rule.graceMs;
  if (age <= due) return "fresh";
  return age <= 2 * due ? "late" : "stale";
}

/** The light tone for a time under `rule`: ok when fresh, unknown when never, else watch or act. */
export function freshnessTone(at: Date | null, now: Date, rule: FreshnessRule): LightTone {
  const state = freshness(at, now, rule);
  if (state === "fresh") return "ok";
  if (state === "never" || at === null) return "unknown";
  const age = now.getTime() - at.getTime();
  return rule.actAfterMs !== undefined && age > rule.actAfterMs ? "act" : "watch";
}
