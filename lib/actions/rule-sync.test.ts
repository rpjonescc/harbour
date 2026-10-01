import type { Issue, RuleOutcome } from "@/lib/scan/issues";
import { actionFields, planRuleSync, type RuleActionState } from "./rule-sync";
import type { ActionStatus } from "./types";

const D = "2026-10-03";

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: "missing-title",
  area: "SEO",
  impact: "high",
  title: "2 pages have no title",
  problem: "These pages have no <title>.",
  fix: "Give each page a title.",
  check: "Each listed URL serves a <title>.",
  locations: ["https://docs.example.com/a", "https://docs.example.com/b"],
  total: 2,
  effort: "small",
  docs: ["research/seo/technical-seo-checklist.md"],
  ...over,
});

const present = (ruleId = "missing-title"): RuleOutcome => ({
  ruleId,
  state: "present",
  issue: issue({ id: ruleId }),
});
const clear = (ruleId = "missing-title"): RuleOutcome => ({ ruleId, state: "clear" });
const unknown = (ruleId = "missing-title"): RuleOutcome => ({
  ruleId,
  state: "unknown",
  reason: "Crawler did not run ok in this scan",
});

const row = (
  status: ActionStatus,
  issuePresent: boolean,
  ruleKey = "missing-title",
  id = 7,
): RuleActionState => ({ id, ruleKey, status, issuePresent });

describe("planRuleSync: present", () => {
  it("inserts an open action when there is none", () => {
    expect(planRuleSync([], [present()], D)).toEqual([
      { kind: "insert", issue: issue(), note: "Found in scan of 2026-10-03" },
    ]);
  });

  it.each(["open", "in_progress", "snoozed"] as const)(
    "refreshes a %s action without changing its status",
    (status) => {
      expect(planRuleSync([row(status, true)], [present()], D)).toEqual([
        { kind: "refresh", id: 7, issue: issue() },
      ]);
    },
  );

  it("only refreshes a dismissed action while the issue persists", () => {
    expect(planRuleSync([row("dismissed", true)], [present()], D)).toEqual([
      { kind: "refresh", id: 7, issue: issue() },
    ]);
  });

  it("reopens a dismissed action whose issue had cleared and is back", () => {
    expect(planRuleSync([row("dismissed", false)], [present()], D)).toEqual([
      {
        kind: "status",
        id: 7,
        from: "dismissed",
        to: "open",
        issue: issue(),
        note: "Back in scan of 2026-10-03",
      },
    ]);
  });

  it("reopens an action the owner marked done while the issue is still present", () => {
    expect(planRuleSync([row("done", true)], [present()], D)).toEqual([
      {
        kind: "status",
        id: 7,
        from: "done",
        to: "open",
        issue: issue(),
        note: "Still present in scan of 2026-10-03",
      },
    ]);
  });

  it("reopens a resolved action whose issue is back", () => {
    expect(planRuleSync([row("done", false)], [present()], D)).toEqual([
      {
        kind: "status",
        id: 7,
        from: "done",
        to: "open",
        issue: issue(),
        note: "Back in scan of 2026-10-03",
      },
    ]);
  });
});

describe("planRuleSync: clear", () => {
  it.each(["open", "in_progress", "snoozed"] as const)("resolves a %s action", (status) => {
    expect(planRuleSync([row(status, true)], [clear()], D)).toEqual([
      {
        kind: "status",
        id: 7,
        from: status,
        to: "done",
        issue: null,
        note: "Resolved — not found in scan of 2026-10-03",
      },
    ]);
  });

  it.each(["done", "dismissed"] as const)("only records the issue is gone on a %s action", (s) => {
    expect(planRuleSync([row(s, true)], [clear()], D)).toEqual([
      { kind: "presence", id: 7, present: false },
    ]);
  });

  it("does nothing when there is no action", () => {
    expect(planRuleSync([], [clear()], D)).toEqual([]);
  });
});

describe("planRuleSync: unknown", () => {
  it("does nothing when there is no action", () => {
    expect(planRuleSync([], [unknown()], D)).toEqual([]);
  });

  it.each([
    ["open", true],
    ["in_progress", true],
    ["snoozed", true],
    ["done", true],
    ["done", false],
    ["dismissed", true],
    ["dismissed", false],
  ] as const)("never resolves, reopens or touches a %s action (present: %s)", (status, was) => {
    expect(planRuleSync([row(status, was)], [unknown()], D)).toEqual([]);
  });
});

describe("planRuleSync: a whole scan", () => {
  it("plans each rule on its own and leaves rows for retired rules alone", () => {
    const existing = [
      row("open", true, "missing-title", 1),
      row("done", false, "broken-links", 2),
      row("open", true, "noindex", 3),
      row("open", true, "retired-rule", 4),
    ];
    const outcomes = [clear("missing-title"), present("broken-links"), unknown("noindex")];
    outcomes.push(present("no-llms-txt"), clear("no-faq-schema"));
    expect(planRuleSync(existing, outcomes, D)).toEqual([
      expect.objectContaining({ kind: "status", id: 1, from: "open", to: "done" }),
      expect.objectContaining({ kind: "status", id: 2, from: "done", to: "open" }),
      { kind: "insert", issue: issue({ id: "no-llms-txt" }), note: "Found in scan of 2026-10-03" },
    ]);
  });
});

describe("actionFields", () => {
  it("maps an issue to action content with linked evidence", () => {
    const fields = actionFields(
      issue({
        locations: [
          "https://docs.example.com/gone (HTTP 404), linked from https://docs.example.com/",
          "Home page has no FAQ markup",
          "ftp://docs.example.com/file",
        ],
        total: 31,
      }),
    );
    expect(fields).toEqual({
      area: "SEO",
      title: "2 pages have no title",
      why: "These pages have no <title>.",
      fix: "Give each page a title.",
      check: "Each listed URL serves a <title>.",
      impact: "high",
      effort: "small",
      docs: ["research/seo/technical-seo-checklist.md"],
      evidence: {
        items: [
          {
            text: "https://docs.example.com/gone (HTTP 404), linked from https://docs.example.com/",
            url: "https://docs.example.com/gone",
          },
          { text: "Home page has no FAQ markup", url: null },
          { text: "ftp://docs.example.com/file", url: null },
        ],
        total: 31,
      },
    });
  });

  it.each([
    ["https://docs.example.com/a, and 3 more", "https://docs.example.com/a"],
    ["https://docs.example.com/a; see robots.txt", "https://docs.example.com/a"],
    ["https://docs.example.com/a.", "https://docs.example.com/a"],
    ["https://docs.example.com/a) is broken", "https://docs.example.com/a"],
    ["https://docs.example.com/a).", "https://docs.example.com/a"],
  ])("links %j without its trailing punctuation", (location, url) => {
    const [item] = actionFields(issue({ locations: [location], total: 1 })).evidence.items;
    expect(item).toEqual({ text: location, url });
  });

  it("bounds every field and never links a URL with credentials", () => {
    const fields = actionFields(
      issue({
        title: "t".repeat(200),
        problem: "w".repeat(900),
        fix: "f".repeat(900),
        check: "c".repeat(500),
        locations: [
          `https://docs.example.com/${"x".repeat(400)}`,
          ...Array.from({ length: 25 }, () => "https://owner:pw@docs.example.com/"),
        ],
        total: 26,
        docs: ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"],
      }),
    );
    expect(fields.title).toHaveLength(120);
    expect(fields.why).toHaveLength(800);
    expect(fields.fix).toHaveLength(800);
    expect(fields.check).toHaveLength(400);
    expect(fields.docs).toHaveLength(5);
    expect(fields.evidence.items).toHaveLength(20);
    expect(fields.evidence.total).toBe(26);
    expect(fields.evidence.items[0]?.text).toHaveLength(300);
    expect(fields.evidence.items[0]?.url).toMatch(/^https:\/\/docs\.example\.com\/x+$/);
    expect(fields.evidence.items[1]?.url).toBeNull();
  });
});
