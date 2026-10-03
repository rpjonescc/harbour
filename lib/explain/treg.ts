import type { TregProblem } from "@/lib/scan/treg-shapes";

// What the outside-view check says when it does not run or a part of it fails, in plain words.
// Fixed sentences: nothing from Treg's answers goes into a message, an event or a log line.

export const TREG_REASONS = {
  noSearches: "No searches chosen yet",
  noKey:
    "Treg isn't connected: add HARBOUR_TREG_API_KEY to .env and restart the worker (see the outside view in README.md).",
  budget: "budget: the monthly budget does not cover the next outside-view check",
  paused:
    "Treg was paused after an earlier check found a problem with the key or the balance. Fix it, then restart Harbour or use Check now.",
  key: "Treg refused Harbour's key: check HARBOUR_TREG_API_KEY in .env, then restart the worker.",
  balance: "Treg says its balance is empty: top it up, then run the check again.",
  rateLimited: "Treg is limiting how fast Harbour may ask: the check will run again later.",
  nothingAnswered: "None of the outside-view checks could be completed this time.",
  nothingAnsweredBilled:
    "None of the outside-view checks could be completed, and some calls may have been billed: the next try waits two days.",
  backingOff: "backing off for two days after calls that may have been billed came to nothing",
} as const;

/** Why one part of the check failed, for Technical details and the summary. */
export const TREG_PROBLEM_TEXT: Readonly<Record<TregProblem, string>> = {
  above_ceiling: "The price was above our ceiling, so the check was not made",
  retired: "The service no longer offers this check",
  server: "The service had a problem answering",
  timeout: "The service took too long to answer",
  unreadable: "The answer could not be read",
  rejected: "The service refused this check",
  network: "The service could not be reached",
};
