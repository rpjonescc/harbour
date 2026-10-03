import type { AiRun } from "@/lib/external/facts";

// What the outside view says in plain words: the two actions it can raise and the "unknown"
// reasons. No jargon: "sites that link to you", "AI assistants", "check".

export const FEW_SITES_MIN = 5;
export const AI_QUESTIONS_MIN = 5;

const sites = (n: number) => (n === 1 ? "1 site links" : `${n} sites link`);
const linkSentence = (n: number) =>
  n === 0 ? "No sites link to you yet" : `Only ${sites(n)} to you`;

/** The action `few-referring-sites` raises: `n` sites link to the product's domain. */
export function fewSitesText(n: number) {
  return {
    title: "Other sites rarely link to you",
    problem: `${linkSentence(n)}. Links from other sites are one way search engines and AI assistants decide who to trust.`,
    fix: "List your site on local and industry directories, and ask partners, suppliers and happy customers who mention you to link to it.",
    check: `At least ${FEW_SITES_MIN} sites link to you at the next checks.`,
  };
}

/** The action `not-named-by-ai` raises. */
export const NOT_NAMED_TEXT = {
  title: "AI assistants don't mention you yet",
  problem:
    "When the questions your customers ask are put to an AI assistant, its answers don't name you or link to you.",
  fix: "Answer those questions plainly on your own pages, say clearly what you do and who it is for, and get mentioned on sites the assistants read.",
  check: "At least one answer names you or links to you at a later check.",
} as const;

/** Why the rules can't judge yet. */
export const OUTSIDE_UNKNOWN = {
  noLinks: "Links to your site haven't been checked yet",
  noAi: "AI assistants haven't been asked about your site yet",
  fewQuestions: `Fewer than ${AI_QUESTIONS_MIN} AI questions have been checked so far`,
  oneWeek: "AI assistants have been asked in one week only: the rule waits for a second week",
} as const;

/** One evidence line: the domain's count and when it was checked. */
export const linksEvidence = (domain: string, n: number, checkedAt: string) =>
  `${domain}: ${n === 0 ? "no sites link" : sites(n)} to it (checked ${checkedAt.slice(0, 10)})`;

/** One evidence line per question asked, with the week it was checked. */
export const questionEvidence = (question: string, run: Pick<AiRun, "checkedAt">) =>
  `${question} (checked ${run.checkedAt.slice(0, 10)})`;

/** What the section says when there is nothing to show, or a notice beside what there is. */
export const OUTSIDE_EMPTY = {
  no_searches:
    "No searches chosen yet. You choose the searches and questions to follow in Harbour's settings file.",
  not_connected: "Treg isn't connected, so Harbour can't ask how the web sees you.",
  not_checked: "Not checked yet.",
} as const;

/** Where the searches are chosen, by file name: shown only under Technical details. */
export const OUTSIDE_SETUP_TECH = {
  topic: "where to choose the searches",
  text: 'Add them under "tracking" for this product in harbour.config.json, then restart Harbour.',
} as const;

export const OUTSIDE_NOTICE = {
  paused_key: "Paused: balance or key. Treg refused Harbour's key.",
  paused_balance: "Paused: balance or key. Treg's balance is empty.",
  budget: "Skipped: this month's budget is used up. The check runs again when it renews.",
  failed: "The last check didn't work.",
  partial_budget:
    "Partly checked: this month's budget ran out part way, so some checks were not made.",
  partial_paused:
    "Partly checked: Treg was paused part way, because its balance is empty or its key was refused.",
  partial_error: "Partly checked: Treg stopped answering part way.",
  partial_failed: "Partly checked: some checks didn't work.",
} as const;

export const OUTSIDE_TITLE = "How the web sees you";
export const OUTSIDE_ONE_LINER =
  "Who links to you, where you appear on Google for the searches you chose, and whether ChatGPT names you.";
export const OUTSIDE_PARTS = {
  what: "Once a week Harbour asks a paid service three things: how many other sites link to you, your position on Google for each search you chose, and whether ChatGPT names you or links to you when it answers each question you chose.",
  why: "Other sites linking to you, a good place in search and being named in AI answers are how new customers find you before they ever visit.",
  todo: "If few sites link to you, get listed on local and industry directories. If you don't show up for a search, make a page that answers it. If ChatGPT doesn't name you, say plainly on your pages what you do and who it is for.",
  worth: "This costs a few cents a week and never changes your scores.",
} as const;

/** "4 sites link to you" / "1 site links to you". */
export const linkingLine = (n: number, ownExcluded = false) => {
  const line =
    n === 0 ? "No sites link to you yet" : `${n} ${n === 1 ? "site links" : "sites link"} to you`;
  return ownExcluded ? `${line} (your own pages not counted)` : line;
};

/** The change in sites linking to you since the check before, or null when there was none. */
export function linkChange(change: number | null): string | null {
  if (change === null) return null;
  if (change === 0) return "No change since the last check";
  const n = Math.abs(change);
  return `${change > 0 ? "Up" : "Down"} ${n} since the last check`;
}

/** A position in words; `null` is "not in the top 30", never a number. */
export const positionText = (position: number | null) =>
  position === null ? "Not in the top 30" : `Position ${position}`;

/** "ChatGPT named you in 1 of 5 answers". */
export const namedLine = (named: number, asked: number) =>
  `ChatGPT named you in ${named} of ${asked} ${asked === 1 ? "answer" : "answers"}`;
