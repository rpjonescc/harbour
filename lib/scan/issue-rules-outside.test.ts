import { type AiRun, buildOutsideFacts, type OutsideFacts } from "@/lib/external/facts";
import { ALL_OK } from "@/tests/helpers/scoring";
import { evaluateRules } from "./issues";

const DAY = 24 * 60 * 60_000;
const T = Date.parse("2026-10-04T06:00:00Z");
const iso = (daysAgo: number) => new Date(T - daysAgo * DAY).toISOString();

const links = (n: number | null, daysAgo = 0): OutsideFacts => ({
  backlinks:
    n === null
      ? null
      : { subject: "docs.example.com", referringDomains: n, checkedAt: iso(daysAgo) },
  aiRuns: [],
});
const run = (daysAgo: number, flags: { named?: boolean; cited?: boolean }[]): AiRun => ({
  checkedAt: iso(daysAgo),
  answers: flags.map((f, i) => ({
    question: `Question ${i + 1} of week ${daysAgo}?`,
    named: f.named ?? false,
    cited: f.cited ?? false,
  })),
});
const asking = (...aiRuns: AiRun[]): OutsideFacts => ({ backlinks: null, aiRuns });
const none = (n: number) => Array.from({ length: n }, () => ({}));

const outcome = (id: string, outside: OutsideFacts | null) =>
  evaluateRules([], ALL_OK, "product", outside).find((o) => o.ruleId === id);

describe("few-referring-sites", () => {
  it.each([0, 1, 4])("is present with %s referring sites, in GEO with medium impact", (n) => {
    const found = outcome("few-referring-sites", links(n));
    expect(found?.state).toBe("present");
    if (found?.state !== "present") return;
    expect(found.issue).toMatchObject({
      area: "GEO",
      impact: "medium",
      effort: "medium",
      total: 1,
    });
    expect(found.issue.problem).toContain(n === 1 ? "Only 1 site links" : `Only ${n} sites link`);
    expect(found.issue.locations[0]).toContain("docs.example.com");
  });

  it.each([5, 6, 400])("is clear at %s or more, so the action resolves", (n) => {
    expect(outcome("few-referring-sites", links(n))).toEqual({
      ruleId: "few-referring-sites",
      state: "clear",
    });
  });

  it("is unknown without a links check, and without any history", () => {
    expect(outcome("few-referring-sites", links(null))?.state).toBe("unknown");
    expect(outcome("few-referring-sites", null)?.state).toBe("unknown");
  });

  it("judges the latest check only", () => {
    const facts = buildOutsideFacts(
      [
        {
          subject: "docs.example.com",
          checkedAt: new Date(T),
          value: { referringDomains: 7 } as never,
        },
        {
          subject: "docs.example.com",
          checkedAt: new Date(T - 7 * DAY),
          value: { referringDomains: 1 } as never,
        },
      ],
      [],
    );
    expect(outcome("few-referring-sites", facts)?.state).toBe("clear");
  });
});

describe("not-named-by-ai", () => {
  it("is present when 5 questions over two weeks named and cited nothing", () => {
    const found = outcome("not-named-by-ai", asking(run(0, none(3)), run(7, none(2))));
    expect(found?.state).toBe("present");
    if (found?.state !== "present") return;
    expect(found.issue).toMatchObject({ area: "GEO", impact: "medium", effort: "large", total: 5 });
    expect(found.issue.title).toBe("AI assistants don't mention you yet");
  });

  it("lists at most 20 questions as evidence but counts them all", () => {
    const found = outcome(
      "not-named-by-ai",
      asking(run(0, none(5)), run(7, none(5)), run(10, none(20))),
    );
    if (found?.state !== "present") throw new Error("expected present");
    expect(found.issue.locations).toHaveLength(20);
    expect(found.issue.total).toBe(30);
  });

  it("resolves when any answer names or cites the site", () => {
    for (const flag of [{ named: true }, { cited: true }]) {
      const facts = asking(run(0, [flag, ...none(2)]), run(7, none(3)));
      expect(outcome("not-named-by-ai", facts)).toEqual({
        ruleId: "not-named-by-ai",
        state: "clear",
      });
    }
  });

  it("is unknown with fewer than 5 questions, with one week only, and with nothing", () => {
    expect(outcome("not-named-by-ai", asking(run(0, none(2)), run(7, none(2))))).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("Fewer than 5"),
    });
    expect(outcome("not-named-by-ai", asking(run(0, none(6))))).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("second week"),
    });
    // Two checks on the same day are not two weeks.
    expect(outcome("not-named-by-ai", asking(run(0, none(3)), run(1, none(3))))?.state).toBe(
      "unknown",
    );
    expect(outcome("not-named-by-ai", asking())?.state).toBe("unknown");
    expect(outcome("not-named-by-ai", null)?.state).toBe("unknown");
  });
});

describe("buildOutsideFacts", () => {
  const answer = (daysAgo: number, question: string, named = false) => ({
    subject: question,
    checkedAt: new Date(T - daysAgo * DAY),
    value: { question, named, cited: false } as never,
  });

  it("groups answers by check time and keeps those within 14 days of the newest", () => {
    const facts = buildOutsideFacts(
      [],
      [answer(0, "a?"), answer(0, "b?"), answer(7, "a?"), answer(14, "a?"), answer(15, "old?")],
    );
    expect(facts.aiRuns.map((r) => r.answers.length)).toEqual([2, 1, 1]);
    expect(facts.aiRuns.flatMap((r) => r.answers.map((a) => a.question))).not.toContain("old?");
  });

  it("has no runs and no links for an empty history", () => {
    expect(buildOutsideFacts([], [])).toEqual({ backlinks: null, aiRuns: [] });
  });
});

describe("the wording", () => {
  const JARGON = /\bGEO\b|backlink|SERP|citation|referring|\bscan|crawl|schema|<|>/i;

  it("is plain: no GEO, backlink, SERP, citation or scan", () => {
    const present = [
      outcome("few-referring-sites", links(2)),
      outcome("not-named-by-ai", asking(run(0, none(3)), run(7, none(2)))),
    ];
    for (const found of present) {
      if (found?.state !== "present") throw new Error("expected present");
      const { title, problem, fix, check } = found.issue;
      for (const text of [title, problem, fix, check]) expect(text).not.toMatch(JARGON);
    }
  });
});
