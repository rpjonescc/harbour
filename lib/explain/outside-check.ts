// What "Run this check now" says when it can't queue a check, in plain words. Each says what
// happened, whether it matters and what to do. Never repeats anything the request carried.

export const OUTSIDE_CHECK_REFUSALS = {
  no_searches:
    "No searches have been chosen for this product yet. Add them to harbour.config.json, then restart Harbour.",
  key_missing:
    "Treg isn't connected, so there is nothing to ask. Add its key to .env and restart the worker.",
  budget_used_up:
    "This month's budget for paid checks is used up (or not set), so this check can't run. It can run again next month, or raise the budget.",
  too_soon: "This product was checked in the last 6 hours. Try again later.",
  daily_cap: "This product has already been checked 3 times today. Try again tomorrow.",
} as const;

export type OutsideRefusal = keyof typeof OUTSIDE_CHECK_REFUSALS;

/** What the button says after a click. */
export const OUTSIDE_CHECK_NOTES = {
  queued: "Checking now. The results appear here in a few minutes.",
  already: "A check is already on its way.",
  failed: "Harbour couldn't start the check. Try again.",
} as const;
