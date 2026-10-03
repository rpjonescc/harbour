import {
  AI_QUESTIONS_MIN,
  FEW_SITES_MIN,
  fewSitesText,
  linksEvidence,
  NOT_NAMED_TEXT,
  OUTSIDE_UNKNOWN,
  questionEvidence,
} from "@/lib/explain/outside";
import { type RuleDef, rule, topicPath } from "./rule-def";

/** Two weekly checks are a week or so apart: the window must span at least this much. */
const MIN_SPAN_MS = 5 * 24 * 60 * 60_000;

/**
 * Raised when fewer than 5 sites link to the product's domain at the latest links check. Unknown
 * until there is one.
 */
export const fewReferringSites: RuleDef = rule(
  {
    id: "few-referring-sites",
    needs: [],
    effort: "medium",
    docs: [topicPath("local-seo")],
  },
  ({ outside }) => {
    const latest = outside?.backlinks;
    if (!latest) return { unknown: OUTSIDE_UNKNOWN.noLinks };
    if (latest.referringDomains >= FEW_SITES_MIN) return "clear";
    return {
      area: "GEO",
      impact: "medium",
      ...fewSitesText(latest.referringDomains),
      locations: [linksEvidence(latest.subject, latest.referringDomains, latest.checkedAt)],
    };
  },
);

/**
 * Raised when at least 5 AI questions were checked over the last two weekly checks and none of the
 * answers named or linked to the product. Resolves when any does; unknown while there are too few
 * questions or only one week of checks.
 */
export const notNamedByAi: RuleDef = rule(
  {
    id: "not-named-by-ai",
    needs: [],
    effort: "large",
    docs: [topicPath("how-ai-engines-pick-sources")],
  },
  ({ outside }) => {
    const runs = outside?.aiRuns ?? [];
    const [newest] = runs;
    const oldest = runs.at(-1);
    if (!newest || !oldest) return { unknown: OUTSIDE_UNKNOWN.noAi };
    const asked = runs.flatMap((run) => run.answers.map((answer) => ({ run, answer })));
    // A single answer that names or links to the site settles it, however few were asked.
    if (asked.some(({ answer }) => answer.named || answer.cited)) return "clear";
    if (asked.length < AI_QUESTIONS_MIN) return { unknown: OUTSIDE_UNKNOWN.fewQuestions };
    const span = Date.parse(newest.checkedAt) - Date.parse(oldest.checkedAt);
    if (span < MIN_SPAN_MS) return { unknown: OUTSIDE_UNKNOWN.oneWeek };
    return {
      area: "GEO",
      impact: "medium",
      ...NOT_NAMED_TEXT,
      locations: asked.map(({ run, answer }) => questionEvidence(answer.question, run)),
    };
  },
);
