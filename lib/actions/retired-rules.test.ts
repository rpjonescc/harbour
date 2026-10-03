import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { RETIRED_RULE_NOTES, TRAINING_ONLY_NOTE } from "@/lib/explain/rule-notes";
import { evaluateRules } from "@/lib/scan/issues";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { planRuleSync } from "./rule-sync";
import { syncRuleActions } from "./rule-sync-store";
import { actionEventsFor, insertAction } from "./store";
import type { ActionStatus } from "./types";

// Formula v3: FAQ markup and llms.txt no longer raise actions, and blocking only AI training
// crawlers is the owner's choice. Open actions close through the normal sync, with the reason.

const NOW = new Date("2026-10-05T06:00:00Z");
/** Acme Docs as it was: no llms.txt, no FAQ markup, GPTBot (training) blocked. */
const OBSERVATIONS = [
  ...ACME_CRAWL.map((o) =>
    o.kind === "page" ? { ...o, value: { ...(o.value as object), hasFaqMarkup: false } } : o,
  ),
  readiness({
    llmsTxt: { present: false, status: 404, bytes: null, truncated: false, error: null },
  }),
];
type Db = ReturnType<typeof openTestDb>;
const sync = (db: Db, statuses = ALL_OK) =>
  syncRuleActions(db, {
    productId: "acme-docs",
    outcomes: evaluateRules(OBSERVATIONS, statuses, "product"),
    scanDate: "2026-10-05",
    now: NOW,
  });
const insert = (db: Db, ruleKey: string, status: ActionStatus = "open") =>
  insertAction(
    db,
    ruleAction({
      ruleKey,
      status,
      snoozedUntil: status === "snoozed" ? "2026-10-09" : null,
    }),
    "scan",
    null,
    new Date("2026-10-01T06:00:00Z"),
  );
const row = (db: Db, id: number) => db.select().from(actions).where(eq(actions.id, id)).get();

describe("rules retired by formula v3", () => {
  it.each(Object.entries(RETIRED_RULE_NOTES))(
    "%s clears with its reason, even when every collector failed",
    (ruleId, why) => {
      const failed = { crawler: "failed", readiness: "failed" } as const;
      for (const statuses of [ALL_OK, failed]) {
        const outcome = evaluateRules(OBSERVATIONS, statuses, "news").find(
          (o) => o.ruleId === ruleId,
        );
        expect(outcome).toEqual({ ruleId, state: "clear", note: why });
      }
    },
  );

  it.each(["open", "in_progress", "snoozed"] as const)(
    "closes a %s action with a plain note and keeps its history",
    (status) => {
      const db = openTestDb();
      const faq = insert(db, "no-faq-schema", status);
      const llms = insert(db, "no-llms-txt", status);
      sync(db);
      expect(row(db, faq)?.status).toBe("done");
      expect(row(db, llms)?.status).toBe("done");
      expect(actionEventsFor(db, faq).at(-1)).toMatchObject({
        actor: "scan",
        to: "done",
        note:
          "Resolved in the check of 2026-10-05: Harbour no longer suggests this. Google stopped " +
          "showing FAQ results in May 2026, so the markup no longer helps.",
      });
      expect(actionEventsFor(db, faq).length).toBeGreaterThan(1);
      expect(actionEventsFor(db, llms).at(-1)?.note).toMatch(/llms\.txt neither helps nor harms/);
    },
  );

  it("keeps a dismissed action dismissed: it is only marked as no longer present", () => {
    const existing = [
      { id: 3, ruleKey: "no-llms-txt", status: "dismissed" as const, issuePresent: true },
    ];
    const ours = evaluateRules(OBSERVATIONS, ALL_OK, "product").filter(
      (o) => o.ruleId === "no-llms-txt",
    );
    expect(planRuleSync(existing, ours, "2026-10-05")).toEqual([
      { kind: "presence", id: 3, present: false },
    ]);
  });
});

describe("AI training crawlers blocked on purpose", () => {
  it("closes an action raised for training crawlers alone, saying it is the owner's choice", () => {
    const db = openTestDb();
    const id = insert(db, "ai-crawlers-blocked");
    sync(db);
    expect(row(db, id)?.status).toBe("done");
    expect(actionEventsFor(db, id).at(-1)?.note).toBe(
      `Resolved in the check of 2026-10-05: ${TRAINING_ONLY_NOTE}`,
    );
  });

  it("still raises a high-impact action when a crawler that answers questions is blocked", () => {
    const access = { GPTBot: "blocked", "OAI-SearchBot": "blocked" };
    const blocked = readiness({ robotsTxt: { state: "ok", aiCrawlerAccess: access } });
    const outcome = evaluateRules([...ACME_CRAWL, blocked], ALL_OK, "product").find(
      (o) => o.ruleId === "ai-crawlers-blocked",
    );
    expect(outcome?.state).toBe("present");
    if (outcome?.state !== "present") return;
    expect(outcome.issue).toMatchObject({
      impact: "high",
      title: "AI assistants can't read your site",
    });
  });
});
