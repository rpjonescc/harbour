import type { ActionStatus } from "@/lib/actions/types";
import type { ActionView } from "@/lib/actions/views";

// Fictional actions for /design and the component tests: one card per status, both themes.

const AT = new Date("2026-10-01T05:04:00Z");

/** A fictional open rule action on acme-docs as the board shows it; override any field. */
export function exampleActionView(over: Partial<ActionView> = {}): ActionView {
  return {
    id: 1,
    productId: "acme-docs",
    area: "SEO",
    title: "3 pages have no title",
    why: "Search results show a generated title for pages without one.",
    fix: "Give each page a unique title of 10–60 characters.",
    check: "Every page has a title.",
    impact: "high",
    effort: "small",
    evidence: {
      items: [
        { text: "https://docs.example.com/pricing", url: "https://docs.example.com/pricing" },
        { text: "https://docs.example.com/setup", url: "https://docs.example.com/setup" },
      ],
      total: 3,
    },
    docs: ["research/acme-docs/seo.md"],
    source: "rule",
    ruleKey: "missing-title",
    sourceJobId: null,
    titleKey: "3 pages have no title",
    status: "open",
    snoozedUntil: null,
    issuePresent: true,
    prUrl: null,
    createdAt: AT,
    updatedAt: AT,
    statusChangedAt: AT,
    events: [{ at: AT, actor: "scan", from: null, to: "open", note: null }],
    historyTruncated: false,
    docLinks: [{ path: "research/acme-docs/seo.md", exists: true }],
    evidenceInvalid: false,
    docsInvalid: false,
    ...over,
  };
}

const ANALYST: Partial<ActionView> = {
  source: "agent",
  ruleKey: null,
  sourceJobId: 1,
  area: "GEO",
  impact: "medium",
  effort: "medium",
  title: "Answer “how do I install Acme Docs?” on the setup page",
  why: "AI assistants quote a competitor's guide for this question.",
  fix: "Add a short, direct answer with the install command at the top of the setup page.",
  check: "The setup page opens with a two-sentence answer and the command.",
  evidence: { items: [{ text: "Asked in 4 of 5 assistant answers", url: null }], total: 1 },
  docs: [],
  docLinks: [],
};

/** One example per status, in the order the owner meets them. */
export const EXAMPLE_ACTIONS: { status: ActionStatus; action: ActionView }[] = [
  {
    status: "suggested",
    action: exampleActionView({
      ...ANALYST,
      id: 101,
      status: "suggested",
      events: [{ at: AT, actor: "agent", from: null, to: "suggested", note: null }],
    }),
  },
  { status: "open", action: exampleActionView({ id: 102 }) },
  {
    status: "in_progress",
    action: exampleActionView({
      id: 103,
      status: "in_progress",
      impact: "medium",
      events: [
        { at: AT, actor: "scan", from: null, to: "open", note: null },
        { at: AT, actor: "owner", from: "open", to: "in_progress", note: "Doing the docs first." },
        {
          at: AT,
          actor: "claude",
          from: "in_progress",
          to: "in_progress",
          note: "Linked PR https://github.com/acme/widget/pull/42",
        },
      ],
      prUrl: "https://github.com/acme/widget/pull/42",
    }),
  },
  {
    status: "snoozed",
    action: exampleActionView({ id: 104, status: "snoozed", snoozedUntil: "2026-10-12" }),
  },
  {
    status: "done",
    action: exampleActionView({ ...ANALYST, id: 105, status: "done", impact: "low" }),
  },
  {
    status: "dismissed",
    action: exampleActionView({
      id: 106,
      status: "dismissed",
      impact: "low",
      area: "AEO",
      evidenceInvalid: true,
      evidence: { items: [], total: 0 },
    }),
  },
];
