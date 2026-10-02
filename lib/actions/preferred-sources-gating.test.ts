import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { evaluateRules } from "@/lib/scan/issues";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { planRuleSync } from "./rule-sync";
import { syncRuleActions } from "./rule-sync-store";
import { insertAction } from "./store";
import type { ActionStatus } from "./types";

const NOW = new Date("2026-10-03T06:00:00Z");
const noButton = readiness({
  preferredSources: { button: false, buttonPages: [], freshUrls: 0, freshContent: false },
});
const outcomes = (kind: "news" | "product") =>
  evaluateRules([...ACME_CRAWL, noButton], ALL_OK, kind);
const sync = (db: ReturnType<typeof openTestDb>, kind: "news" | "product") =>
  syncRuleActions(db, {
    productId: "acme-docs",
    outcomes: outcomes(kind),
    scanDate: "2026-10-03",
    now: NOW,
  });
const row = (db: ReturnType<typeof openTestDb>, id: number) =>
  db.select().from(actions).where(eq(actions.id, id)).get();

describe("existing no-preferred-sources actions after the formula change", () => {
  it.each(["open", "in_progress", "snoozed"] as const)(
    "resolves a %s action for a product site through the normal sync",
    (status: ActionStatus) => {
      const db = openTestDb();
      const id = insertAction(
        db,
        ruleAction({
          ruleKey: "no-preferred-sources",
          status,
          snoozedUntil: status === "snoozed" ? "2026-10-09" : null,
        }),
        "scan",
        null,
        new Date("2026-10-01T06:00:00Z"),
      );
      const counts = sync(db, "product");
      expect(counts.resolved).toBeGreaterThanOrEqual(1);
      expect(row(db, id)?.status).toBe("done");
    },
  );

  it("leaves a news site's action open while the rule still fires", () => {
    const db = openTestDb();
    const id = insertAction(db, ruleAction({ ruleKey: "no-preferred-sources" }), "scan", null, NOW);
    sync(db, "news");
    expect(row(db, id)?.status).toBe("open");
  });

  it("keeps a dismissed action dismissed: it is only marked as no longer present", () => {
    const existing = [
      { id: 3, ruleKey: "no-preferred-sources", status: "dismissed" as const, issuePresent: true },
    ];
    const ours = outcomes("product").filter((o) => o.ruleId === "no-preferred-sources");
    expect(planRuleSync(existing, ours, "2026-10-03")).toEqual([
      { kind: "presence", id: 3, present: false },
    ]);
  });
});
