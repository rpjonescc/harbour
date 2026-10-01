import type { NewAction } from "@/lib/actions/types";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

const t0 = new Date("2026-10-02T09:00:00Z");

/** An open rule action for acme-docs; override any field. */
export function ruleAction(over: Partial<NewAction> = {}): NewAction {
  return {
    productId: "acme-docs",
    area: "SEO",
    title: "Add meta descriptions",
    why: "Pages without a description get a generated snippet.",
    fix: "Write a one-sentence description for each page.",
    check: "Every page has a meta description.",
    impact: "medium",
    effort: "small",
    evidence: {
      items: [{ text: "https://example.com/a", url: "https://example.com/a" }],
      total: 1,
    },
    docs: [],
    source: "rule",
    ruleKey: "missing-meta-description",
    sourceJobId: null,
    status: "open",
    snoozedUntil: null,
    issuePresent: true,
    ...over,
  };
}

/** A suggested agent action from the analyst job `sourceJobId`. */
export function agentAction(
  sourceJobId: number,
  title: string,
  over: Partial<NewAction> = {},
): NewAction {
  return ruleAction({
    source: "agent",
    ruleKey: null,
    sourceJobId,
    issuePresent: null,
    status: "suggested",
    title,
    ...over,
  });
}

/** A finished weekly-analyst job, so agent actions have a source; returns its id. */
export function analystJob(db: Db): number {
  return db
    .insert(jobs)
    .values({
      kind: "weekly-analyst",
      params: {},
      dedupeKey: "weekly-analyst:[]",
      status: "ok",
      requestedBy: null,
      createdAt: t0,
    })
    .returning({ id: jobs.id })
    .get().id;
}
