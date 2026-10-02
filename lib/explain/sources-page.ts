import type { NextDailyScan } from "@/lib/jobs/scan-schedule";

export const SOURCES_INTRO = "Where each score's data comes from, and whether it's working.";

/** When a product's next check is. The 06:00 time is the schedule's (README: When things run). */
export const NEXT_CHECK: Readonly<Record<NextDailyScan, string>> = {
  off: "Next check: only when you choose Check now",
  today: "Next check: today at 06:00",
  tomorrow: "Next check: tomorrow at 06:00",
  due: "Next check: starting shortly",
};

const OUTCOME = {
  ok: "all good",
  partial: "some data was missing",
  failed: "didn't finish",
} as const;

/** How a finished check ended, in words. */
export function checkOutcome(status: keyof typeof OUTCOME): string {
  return OUTCOME[status];
}
