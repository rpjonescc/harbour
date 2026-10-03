import type { ProductKind } from "@/lib/products/catalog";
import { RULES } from "./issue-rules";
import { collectorLabel } from "./labels";
import type { Facts } from "./rule-def";
import type { CollectorStatus, ScanObservation } from "./types";
import { crawlPageFacts, crawlSiteFacts, indexCoverageFacts, readinessFacts } from "./view-shapes";

export type IssueArea = "SEO" | "GEO" | "AEO";
export type Impact = "high" | "medium" | "low";
export type Effort = "small" | "medium" | "large";

/** A problem a scan found, with what to do about it and how to tell it is fixed. */
export type Issue = {
  /** Stable rule id, e.g. "missing-title". */
  id: string;
  area: IssueArea;
  impact: Impact;
  title: string;
  problem: string;
  fix: string;
  check: string;
  /** Where it was found: URLs, some with a note; at most 20. */
  locations: string[];
  /** How many locations there are in all. */
  total: number;
  /** Roughly how much work the fix is. */
  effort: Effort;
  /** Brain paths of research docs that explain the fix. */
  docs: string[];
};

/** What one rule made of one scan: a problem, nothing wrong, or no way to tell (and why). */
export type RuleOutcome =
  | { ruleId: string; state: "present"; issue: Issue }
  | { ruleId: string; state: "clear" }
  | { ruleId: string; state: "unknown"; reason: string };

const IMPACT_ORDER: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Sort comparator: high impact first. */
export const byImpact = (a: Pick<Issue, "impact">, b: Pick<Issue, "impact">) =>
  IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];

/** Every rule's outcome for one scan. Pure. `statuses`: how each collector ended in that scan. */
export function evaluateRules(
  observations: readonly ScanObservation[],
  statuses: Readonly<Record<string, CollectorStatus>>,
  kind: ProductKind,
): RuleOutcome[] {
  const crawled = crawlPageFacts(observations);
  const facts: Facts = {
    pages: crawled.pages,
    unreadablePages: crawled.unreadable,
    site: crawlSiteFacts(observations),
    readiness: readinessFacts(observations),
    coverage: indexCoverageFacts(observations),
    productKind: kind,
  };
  return RULES.map((rule): RuleOutcome => {
    // A collector that did not run ok leaves facts that can't be trusted either way.
    const missing = rule.needs.find((need) => statuses[need] !== "ok");
    if (missing !== undefined) {
      const reason = `${collectorLabel(missing)} did not run ok in this scan`;
      return { ruleId: rule.id, state: "unknown", reason };
    }
    const result = rule.evaluate(facts);
    if (result === "clear") return { ruleId: rule.id, state: "clear" };
    if ("unknown" in result) return { ruleId: rule.id, state: "unknown", reason: result.unknown };
    return { ruleId: rule.id, state: "present", issue: result };
  });
}

/** Present issues only, highest impact first (unchanged contract for the UI). */
export function deriveIssues(
  observations: readonly ScanObservation[],
  statuses: Readonly<Record<string, CollectorStatus>>,
  kind: ProductKind,
): Issue[] {
  return evaluateRules(observations, statuses, kind)
    .flatMap((outcome) => (outcome.state === "present" ? [outcome.issue] : []))
    .sort(byImpact);
}
