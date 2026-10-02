import { insertAction } from "@/lib/actions/store";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { GOOD_NOTE, noteFileText } from "@/tests/helpers/note";
import { seedScan } from "@/tests/helpers/scan-views";
import { gatherFacts } from "./gather";

// Friday 2 October 2026, 06:30 in London (BST).
const NOW = new Date("2026-10-02T05:30:00Z");
const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const },
  {
    id: "fern-and-field",
    name: "Fern & Field",
    url: "https://fern.example.com",
    hue: "green" as const,
  },
];

function setup(files: Record<string, string> = {}) {
  const brain = makeBrain(files);
  const db = openTestDb();
  const gather = (over: { backup?: "ok" | "stale" } = {}) =>
    gatherFacts({
      db,
      products: PRODUCTS,
      ownerFirstName: "Sam",
      timeZone: "Europe/London",
      root: brain.root,
      backup: over.backup ?? "ok",
      now: NOW,
    });
  return { brain, db, gather };
}

describe("gatherFacts", () => {
  it("builds the snapshot from real scans, the board, finished work and earlier notes", () => {
    const { brain, db, gather } = setup({
      "notes/daily/2026-10-01-0630.md": noteFileText({
        ...GOOD_NOTE,
        headline: "Yesterday's headline",
      }),
    });
    try {
      seedScan(db, {
        productId: "acme-docs",
        at: new Date("2026-10-01T05:00:00Z"),
        totals: { seo: 50, geo: 40, aeo: 30 },
      });
      seedScan(db, {
        productId: "acme-docs",
        at: new Date("2026-10-02T05:00:00Z"),
        totals: { seo: 53, geo: 40, aeo: 30 },
      });
      insertAction(
        db,
        ruleAction({ title: "Add meta descriptions", status: "open" }),
        "scan",
        null,
        NOW,
      );
      insertAction(
        db,
        agentAction(analystJob(db), "Fix the missing page titles", { status: "done" }),
        "owner",
        null,
        new Date("2026-10-02T03:00:00Z"),
      );
      const facts = gather();
      expect(facts).toMatchObject({
        weekday: "Friday",
        time: "06:30",
        rest: null,
        ownerFirstName: "Sam",
      });
      expect(facts.products[0]?.areas[0]).toEqual({
        name: "Found on Google",
        score: 53,
        verdict: "Fair",
        change: "up 3 since the last check",
      });
      expect(facts.actions.map((a) => [a.title, a.whoOnIt])).toEqual([
        ["Add meta descriptions", "Waiting for you"],
      ]);
      expect(facts.wins).toEqual([
        "Finished: Fix the missing page titles",
        "Found on Google for Acme Docs is up 3 since the last check",
      ]);
      expect(facts.trouble).toEqual([]);
      expect(facts.recentHeadlines).toEqual(["Yesterday's headline"]);
    } finally {
      brain.cleanup();
    }
  });

  it("with no scans and an empty board has no scores and no actions: never the sample's numbers", () => {
    const { brain, gather } = setup();
    try {
      const facts = gather();
      for (const product of facts.products) {
        expect(product.areas).toEqual([]);
        expect(product.noScoreYet).toHaveLength(3);
      }
      expect(facts.actions).toEqual([]);
      expect(facts.wins).toEqual([]);
      expect(JSON.stringify(facts)).not.toContain("An AI assistant cites a competitor");
    } finally {
      brain.cleanup();
    }
  });

  it("lists the trouble the briefing would: a failing data source and a stale backup", () => {
    const { brain, db, gather } = setup();
    try {
      seedScan(db, {
        productId: "acme-docs",
        at: new Date("2026-10-02T05:00:00Z"),
        status: "partial",
        runs: [{ collector: "pagespeed", status: "failed", error: "boom" }],
      });
      expect(gather({ backup: "stale" }).trouble).toEqual([
        "Google speed test (PageSpeed) had a problem in the last check",
        "no backup in the last 2 days",
      ]);
    } finally {
      brain.cleanup();
    }
  });

  it("does not count a score rise from a scan older than a day as a win", () => {
    const { brain, db, gather } = setup();
    try {
      seedScan(db, {
        productId: "acme-docs",
        at: new Date("2026-09-29T05:00:00Z"),
        totals: { seo: 50, geo: 40, aeo: 30 },
      });
      seedScan(db, {
        productId: "acme-docs",
        at: new Date("2026-09-30T05:00:00Z"),
        totals: { seo: 55, geo: 40, aeo: 30 },
      });
      expect(gather().wins).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });
});
