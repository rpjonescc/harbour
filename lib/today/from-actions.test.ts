import { linkPullRequest } from "@/lib/actions/pr-link";
import { insertAction, setStatus } from "@/lib/actions/store";
import type { NewAction } from "@/lib/actions/types";
import type { Db } from "@/lib/db/client";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { attentionFromActions } from "./from-actions";

const PRODUCTS = ["acme-docs", "acme-shop"] as const;
const t0 = new Date("2026-10-02T09:00:00Z");

let minute = 0;
function add(db: Db, over: Partial<NewAction>): number {
  minute += 1;
  const at = new Date(t0.getTime() + minute * 60_000);
  return insertAction(db, ruleAction({ ruleKey: `rule-${minute}`, ...over }), "scan", null, at);
}

describe("attentionFromActions", () => {
  beforeEach(() => {
    minute = 0;
  });

  it("shows the top three active actions in board order and counts the rest", () => {
    const db = openTestDb();
    add(db, { title: "low", impact: "low", fix: "Fix the low one." });
    add(db, { title: "medium", impact: "medium" });
    const started = add(db, { title: "high started", impact: "high", status: "in_progress" });
    add(db, { title: "high open", impact: "high", effort: "small", productId: "acme-shop" });
    const result = attentionFromActions(db, PRODUCTS);
    expect(result.actions.map((a) => a.title)).toEqual(["high started", "high open", "medium"]);
    expect(result.actions[0]).toEqual({
      id: started,
      productId: "acme-docs",
      area: "SEO",
      impact: "high",
      effort: "small",
      title: "high started",
      reason: "Pages without a description get a generated snippet.",
      who: "you",
      href: `/actions#action-${started}`,
    });
    expect(result.more).toBe(1);
    expect(result.work).toEqual([
      { productId: "acme-docs", area: "SEO", who: "you" },
      { productId: "acme-docs", area: "SEO", who: "you" },
      { productId: "acme-docs", area: "SEO", who: "you" },
      { productId: "acme-shop", area: "SEO", who: "you" },
    ]);
  });

  it("leaves out suggested, snoozed, done and dismissed actions and unconfigured products", () => {
    const db = openTestDb();
    add(db, { title: "snoozed", status: "snoozed", snoozedUntil: "2026-10-12" });
    add(db, { title: "done", status: "done" });
    add(db, { title: "dismissed", status: "dismissed" });
    add(db, { title: "retired", productId: "retired-product" });
    insertAction(db, agentAction(analystJob(db), "suggested"), "agent", null, t0);
    add(db, { title: "open", impact: "low" });
    const result = attentionFromActions(db, PRODUCTS);
    expect(result.actions.map((a) => a.title)).toEqual(["open"]);
    expect(result.more).toBe(0);
    expect(result.work).toEqual([{ productId: "acme-docs", area: "SEO", who: "you" }]);
  });

  it("is empty without active actions or configured products", () => {
    const db = openTestDb();
    expect(attentionFromActions(db, PRODUCTS)).toEqual({
      actions: [],
      more: 0,
      work: [],
    });
    add(db, { title: "open" });
    expect(attentionFromActions(db, [])).toEqual({ actions: [], more: 0, work: [] });
  });

  it("says Claude is on what Claude started, and that a pull request waits for the owner", () => {
    const db = openTestDb();
    const claude = add(db, { title: "claude", area: "GEO" });
    setStatus(db, claude, "open", "in_progress", {
      actor: "claude",
      note: "Adding llms.txt",
      now: t0,
    });
    const pr = add(db, { title: "pr", area: "AEO" });
    setStatus(db, pr, "open", "in_progress", { actor: "claude", note: "Opened a PR", now: t0 });
    linkPullRequest(db, {
      id: pr,
      url: "https://github.com/example/site/pull/3",
      productIds: [...PRODUCTS],
      now: t0,
    });
    expect(attentionFromActions(db, PRODUCTS).work).toEqual([
      { productId: "acme-docs", area: "GEO", who: "claude" },
      { productId: "acme-docs", area: "AEO", who: "pr_waiting" },
    ]);
    expect(attentionFromActions(db, PRODUCTS).actions.map((a) => [a.title, a.who])).toEqual([
      ["claude", "claude"],
      ["pr", "pr_waiting"],
    ]);
  });
});
