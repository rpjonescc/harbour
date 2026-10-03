import { eq } from "drizzle-orm";
import { buildWeeklyExport } from "@/lib/analyst/export";
import { actions } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import type { Issue } from "@/lib/scan/issues";
import { openTestDb } from "@/tests/helpers/db";
import { activeWork } from "../active-work";
import { actionHandoffPrompt } from "../handoff";
import { syncRuleActions } from "../rule-sync-store";
import { actionCounts, boardActions, openActionCount, topActiveActions } from "../views";
import { type CliDeps, runActionsCli } from "./run";

const t0 = new Date("2026-10-02T09:00:00Z");
const PRODUCT: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
  kind: "product",
};
const ADD = [
  "add",
  "--product",
  "acme-docs",
  "--title",
  "Hand the page titles to the docs owner",
  "--why",
  "The owner session needs a tracked item for this hand-off.",
  "--area",
  "GEO",
  "--impact",
  "high",
  "--effort",
  "medium",
  "--evidence",
  "Seen on /a",
  "--doc",
  "https://example.com/guide",
  "--status",
  "in_progress",
];

function made() {
  const db = openTestDb();
  const deps: CliDeps = { db, products: [PRODUCT], timeZone: "Europe/London", now: t0 };
  expect(runActionsCli(ADD, deps).code).toBe(0);
  return db;
}

const issue = (id: string): Issue => ({
  id,
  area: "SEO",
  impact: "low",
  title: "1 page has no title",
  problem: "No title.",
  fix: "Add one.",
  check: "Has one.",
  locations: ["https://docs.example.com/a"],
  total: 1,
  effort: "small",
  docs: [],
});

describe("a hand-made action on the rest of Harbour", () => {
  it("is never closed, rewritten or reopened by rule sync", () => {
    const db = made();
    const before = db.select().from(actions).where(eq(actions.id, 1)).get();
    const sync = (outcomes: Parameters<typeof syncRuleActions>[1]["outcomes"], day: string) =>
      syncRuleActions(db, { productId: "acme-docs", outcomes, scanDate: day, now: t0 });
    // A scan with no issues would resolve every unresolved rule action; this one is not a rule action.
    expect(sync([{ ruleId: "missing-title", state: "clear" }], "2026-10-03")).toEqual({
      created: 0,
      resolved: 0,
      reopened: 0,
    });
    expect(
      sync(
        [{ ruleId: "missing-title", state: "present", issue: issue("missing-title") }],
        "2026-10-04",
      ),
    ).toMatchObject({
      created: 1,
    });
    expect(sync([{ ruleId: "missing-title", state: "clear" }], "2026-10-05")).toMatchObject({
      resolved: 1,
    });
    expect(db.select().from(actions).where(eq(actions.id, 1)).get()).toEqual(before);
  });

  it("shows on the board with its area, impact, effort, evidence and who is on it", () => {
    const db = made();
    const filter = { productId: null, area: null, status: "active" } as const;
    const [view] = boardActions(db, filter, ["acme-docs"]).groups.flatMap((g) => g.actions);
    expect(view).toMatchObject({
      id: 1,
      area: "GEO",
      impact: "high",
      effort: "medium",
      source: "manual",
      ruleKey: null,
      status: "in_progress",
      evidenceInvalid: false,
      docsInvalid: false,
      docLinks: [],
    });
    expect(view?.evidence).toEqual({
      items: [
        { text: "Seen on /a", url: null },
        { text: "https://example.com/guide", url: "https://example.com/guide" },
      ],
      total: 2,
    });
    expect(view?.events.map((e) => [e.actor, e.from, e.to])).toEqual([
      ["claude", null, "in_progress"],
    ]);
  });

  it("counts on Today, the badge, Next up and active work", () => {
    const db = made();
    expect(actionCounts(db, ["acme-docs"]).in_progress).toBe(1);
    expect(openActionCount(db, ["acme-docs"])).toBe(1);
    expect(topActiveActions(db, ["acme-docs"], 3).actions.map((a) => a.id)).toEqual([1]);
    expect(activeWork(db, ["acme-docs"]).map((w) => [w.id, w.statusActor])).toEqual([
      [1, "claude"],
    ]);
  });

  it("appears in the analyst export as manual, so the analyst does not repeat it", () => {
    const db = made();
    const exported = buildWeeklyExport(db, {
      products: [PRODUCT],
      week: "2026-W40",
      now: new Date("2026-10-04T19:00:00Z"),
      timeZone: "Europe/London",
    });
    expect(exported.actions).toEqual([
      expect.objectContaining({ id: 1, source: "manual", status: "in_progress", ageDays: 2 }),
    ]);
  });

  it("hands to Claude as unchecked text, fenced and labelled", () => {
    const db = made();
    const row = db.select().from(actions).where(eq(actions.id, 1)).get();
    if (!row) throw new Error("no row");
    const prompt = actionHandoffPrompt(PRODUCT, row);
    expect(prompt).toContain("Added by hand through the Harbour CLI — check it before acting.");
    expect(prompt).toContain("```text\nProblem: Hand the page titles to the docs owner.");
  });
});
