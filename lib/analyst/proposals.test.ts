import { actionEventsFor, insertAction, setStatus } from "@/lib/actions/store";
import type { ActionStatus } from "@/lib/actions/types";
import { actions, jobs } from "@/lib/db/schema";
import { agentAction, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { importWeeklyActions, parseWeeklyProposals, type WeeklyProposals } from "./proposals";

const NOW = new Date("2026-10-04T19:05:00Z");
const IDS = ["acme-docs", "beta-shop"];

type Proposed = WeeklyProposals["actions"][number];

function proposed(over: Partial<Proposed> = {}): Proposed {
  return {
    productId: "acme-docs",
    area: "GEO",
    title: "Answer the top buyer question on the home page",
    why: "AI assistants quote pages that answer the question directly.",
    fix: "Add a short answer near the top of the home page.",
    check: "The home page answers the question in its first paragraph.",
    impact: "high",
    effort: "small",
    evidence: [{ url: "https://docs.example.com/", note: "No answer on the home page" }],
    docs: ["research/geo/how-ai-engines-pick-sources.md"],
    ...over,
  };
}

const file = (list: unknown[]) => JSON.stringify({ actions: list });

function weeklyJob(db: ReturnType<typeof openTestDb>): number {
  return db
    .insert(jobs)
    .values({
      kind: "weekly-analyst",
      params: { week: "2026-W40" },
      dedupeKey: "weekly-analyst:2026-W40",
      status: "running",
      requestedBy: null,
      createdAt: NOW,
    })
    .returning({ id: jobs.id })
    .get().id;
}

describe("parseWeeklyProposals", () => {
  it("accepts a valid file", () => {
    expect(parseWeeklyProposals(`﻿${file([proposed()])}`, IDS)).toEqual({
      actions: [proposed()],
    });
    expect(
      parseWeeklyProposals(
        file([proposed({ evidence: [{ note: "Seen in the scan" }], docs: [] })]),
        IDS,
      ),
    ).toMatchObject({ actions: [{ evidence: [{ note: "Seen in the scan" }] }] });
  });

  it("refuses text that is not JSON", () => {
    expect(() => parseWeeklyProposals("{ nope", IDS)).toThrow(/not valid JSON/);
  });

  it.each([
    [
      "more than 10 actions",
      file(Array.from({ length: 11 }, (_, i) => proposed({ title: `Do ${i}` }))),
    ],
    ["a long title", file([proposed({ title: "t".repeat(121) })])],
    ["a long why", file([proposed({ why: "w".repeat(801) })])],
    ["a long fix", file([proposed({ fix: "f".repeat(801) })])],
    ["a long check", file([proposed({ check: "c".repeat(401) })])],
    ["an empty title", file([proposed({ title: "  " })])],
    [
      "more than 10 evidence items",
      file([proposed({ evidence: Array.from({ length: 11 }, () => ({ note: "n" })) })]),
    ],
    ["a long evidence note", file([proposed({ evidence: [{ note: "n".repeat(301) }] })])],
    [
      "a non-http evidence URL",
      file([proposed({ evidence: [{ url: "javascript:alert(1)", note: "n" }] })]),
    ],
    [
      "an evidence URL with credentials",
      file([proposed({ evidence: [{ url: "https://u:p@example.com/", note: "n" }] })]),
    ],
    [
      "more than 5 docs",
      file([proposed({ docs: Array.from({ length: 6 }, (_, i) => `research/d${i}.md`) })]),
    ],
    ["a docs path with ..", file([proposed({ docs: ["research/../../etc/passwd.md"] })])],
    ["an absolute docs path", file([proposed({ docs: ["/etc/notes.md"] })])],
    ["a docs path that is not Markdown", file([proposed({ docs: ["research/notes.txt"] })])],
    ["a long docs path", file([proposed({ docs: [`research/${"d".repeat(200)}.md`] })])],
    ["an unknown area", file([proposed({ area: "PPC" as "SEO" })])],
    ["an unknown impact", file([proposed({ impact: "huge" as "high" })])],
    ["an extra field", file([{ ...proposed(), status: "open" }])],
    ["an extra top-level field", JSON.stringify({ actions: [], note: "hi" })],
  ])("refuses %s", (_, text) => {
    expect(() => parseWeeklyProposals(text, IDS)).toThrow(/invalid/);
  });

  it("refuses a product that is not configured", () => {
    expect(() => parseWeeklyProposals(file([proposed({ productId: "ghost" })]), IDS)).toThrow(
      /actions\.0\.productId|Unknown product: ghost/,
    );
  });
});

describe("importWeeklyActions", () => {
  it("inserts suggested agent actions with their evidence, docs and an agent event", () => {
    const db = openTestDb();
    const jobId = weeklyJob(db);
    const result = importWeeklyActions(db, { actions: [proposed()] }, jobId, NOW);
    expect(result).toEqual({ added: 1, skipped: 0 });
    const row = db.select().from(actions).get();
    expect(row).toMatchObject({
      productId: "acme-docs",
      area: "GEO",
      status: "suggested",
      source: "agent",
      sourceJobId: jobId,
      ruleKey: null,
      issuePresent: null,
      titleKey: "answer the top buyer question on the home page",
      evidence: {
        items: [{ text: "No answer on the home page", url: "https://docs.example.com/" }],
        total: 1,
      },
      docs: ["research/geo/how-ai-engines-pick-sources.md"],
    });
    expect(actionEventsFor(db, row?.id ?? 0)).toMatchObject([
      {
        actor: "agent",
        from: null,
        to: "suggested",
        note: "Suggested by the weekly report 2026-W40",
      },
    ]);
  });

  it.each<ActionStatus>(["suggested", "open", "in_progress", "snoozed", "dismissed"])(
    "skips a title the product already has as %s",
    (status) => {
      const db = openTestDb();
      const jobId = weeklyJob(db);
      const id = insertAction(
        db,
        ruleAction({ title: "ANSWER the top buyer question on the home page!" }),
        "scan",
        null,
        NOW,
      );
      if (status !== "open") {
        setStatus(db, id, "open", status, { actor: "owner", snoozedUntil: "2026-11-01", now: NOW });
      }
      expect(importWeeklyActions(db, { actions: [proposed()] }, jobId, NOW)).toEqual({
        added: 0,
        skipped: 1,
      });
    },
  );

  it("suggests again what was done, and what another product has", () => {
    const db = openTestDb();
    const jobId = weeklyJob(db);
    const done = insertAction(db, agentAction(jobId, proposed().title), "agent", null, NOW);
    setStatus(db, done, "suggested", "done", { actor: "owner", now: NOW });
    insertAction(
      db,
      ruleAction({ productId: "beta-shop", title: proposed().title }),
      "scan",
      null,
      NOW,
    );
    expect(importWeeklyActions(db, { actions: [proposed()] }, jobId, NOW)).toEqual({
      added: 1,
      skipped: 0,
    });
  });

  it("skips a title the file repeats", () => {
    const db = openTestDb();
    const jobId = weeklyJob(db);
    const again = proposed({ title: "  answer the top buyer question on the home page." });
    expect(importWeeklyActions(db, { actions: [proposed(), again] }, jobId, NOW)).toEqual({
      added: 1,
      skipped: 1,
    });
  });

  it("imports nothing when the file is invalid", () => {
    const db = openTestDb();
    const text = file([proposed(), proposed({ productId: "ghost", title: "Other" })]);
    expect(() => parseWeeklyProposals(text, IDS)).toThrow();
    expect(db.select().from(actions).all()).toEqual([]);
  });
});
