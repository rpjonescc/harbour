// Why Harbour closed an action without the owner fixing anything: the rule stopped applying
// (formula v3). Said in the action's history beside the date of the check that closed it.

/** Rules Harbour no longer raises, and why, in plain words. */
export const RETIRED_RULE_NOTES = {
  "no-faq-schema":
    "Harbour no longer suggests this. Google stopped showing FAQ results in May 2026, so the " +
    "markup no longer helps.",
  "no-llms-txt":
    "Harbour no longer suggests this. Google says llms.txt neither helps nor harms, and no AI " +
    "assistant is known to use it.",
} as const;

/** When `ai-crawlers-blocked` clears while training crawlers may still be blocked. */
export const TRAINING_ONLY_NOTE =
  "The AI crawlers that answer questions can read your site. Blocking training crawlers is your " +
  "choice, so Harbour doesn't raise it.";

/** The history note on an action a rule closed with a reason. */
export const closedNote = (why: string, date: string) => `Resolved in the check of ${date}: ${why}`;
