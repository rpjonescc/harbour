// Why a collector does not run in this scan: its weekly cadence, or (paid) the monthly budget.
import { budgetSkipReason } from "@/lib/costs/guard";
import type { ScanDeps } from "./run-scan";
import { lastOkRunAt, latestAnsweredRun } from "./store";
import type { Collector } from "./types";

// A weekly collector is due 7 days after its last ok run, less 12 h of slack so a daily scan
// that starts a little earlier than last week's doesn't push the run back a whole day.
const WEEKLY_DUE_MS = (7 * 24 - 12) * 60 * 60_000;

function weeklySkipReason(
  deps: Pick<ScanDeps, "db">,
  productId: string,
  collector: Collector,
  now: Date,
): string | null {
  if (collector.cadence !== "weekly") return null;
  const last = lastOkRunAt(deps.db, productId, collector.id);
  if (!last || now.getTime() - last.getTime() >= WEEKLY_DUE_MS) return null;
  return `runs weekly; last ran ${last.toISOString().slice(0, 10)}`;
}

const DAY_MS = 24 * 60 * 60_000;
const SLACK_MS = 12 * 60 * 60_000;

function backoffSkipReason(
  deps: Pick<ScanDeps, "db">,
  productId: string,
  collector: Collector,
  now: Date,
): string | null {
  const { backoff } = collector;
  if (!backoff) return null;
  const last = latestAnsweredRun(deps.db, productId, collector.id);
  if (last?.status !== "failed" || last.error !== backoff.error) return null;
  const waited = now.getTime() - last.finishedAt.getTime();
  // Slack like the weekly rule, so a scan a little earlier than the last one is not pushed back a day.
  return waited < backoff.days * DAY_MS - SLACK_MS ? backoff.reason : null;
}

/**
 * Why the collector is skipped before it runs, or null; throws when the budget check fails. A
 * `manual` run (the owner asked) skips the cadence and backoff rules, never the budget.
 */
export function skipReason(
  deps: Pick<ScanDeps, "db" | "budget">,
  productId: string,
  collector: Collector,
  now: Date,
  manual = false,
): string | null {
  const weekly = manual ? null : weeklySkipReason(deps, productId, collector, now);
  if (weekly || !collector.paid) return weekly;
  const backoff = manual ? null : backoffSkipReason(deps, productId, collector, now);
  if (backoff) return backoff;
  try {
    return budgetSkipReason(deps.db, deps.budget.capMicroAud, deps.budget.timeZone, now);
  } catch (error) {
    throw new Error(`budget check failed: ${error instanceof Error ? error.message : error}`);
  }
}
