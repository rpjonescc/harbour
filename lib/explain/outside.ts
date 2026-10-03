import type { AiRun } from "@/lib/external/facts";

// What the outside view says in plain words: the two actions it can raise and the "unknown"
// reasons. No jargon: "sites that link to you", "AI assistants", "check".

export const FEW_SITES_MIN = 5;
export const AI_QUESTIONS_MIN = 5;

const sites = (n: number) => (n === 1 ? "1 site links" : `${n} sites link`);

/** The action `few-referring-sites` raises: `n` sites link to the product's domain. */
export function fewSitesText(n: number) {
  return {
    title: "Other sites rarely link to you",
    problem: `Only ${sites(n)} to you. Links from other sites are one way search engines and AI assistants decide who to trust.`,
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
  `${domain}: ${sites(n)} to it (checked ${checkedAt.slice(0, 10)})`;

/** One evidence line per question asked, with the week it was checked. */
export const questionEvidence = (question: string, run: Pick<AiRun, "checkedAt">) =>
  `${question} (checked ${run.checkedAt.slice(0, 10)})`;
