import { ruleAction } from "@/tests/helpers/actions";
import { ago, DAY, ACME_DOCS as docs, HOUR, LONDON, MIN, t0 } from "@/tests/helpers/tower";
import { runwayCard } from "./runway";
import type { RunwayFacts } from "./runway-data";

const totals = { seo: 80, geo: 70, aeo: 60 };
const byState = {
  indexed: 3,
  discovered_not_indexed: 40,
  crawled_not_indexed: 10,
  unknown_to_google: 0,
  blocked: 0,
  other: 0,
  unknown: 0,
};

const sitemap = ruleAction({ title: "Add a sitemap" });

function facts(over: Partial<RunwayFacts> = {}): RunwayFacts {
  return {
    product: docs,
    today: {
      row: {
        productId: docs.id,
        scanned: true,
        lastCheckFailed: false,
        totals,
        complete: { seo: true, geo: true, aeo: true },
        deltas: { seo: null, geo: null, aeo: null },
        trend: [],
      },
      scannedAt: ago(3 * HOUR),
      scanning: false,
      failedAt: null,
      failures: [],
    },
    nextAction: {
      ...sitemap,
      ruleKey: sitemap.ruleKey ?? null,
      sourceJobId: sitemap.sourceJobId ?? null,
      snoozedUntil: sitemap.snoozedUntil ?? null,
      issuePresent: sitemap.issuePresent ?? null,
      id: 12,
      titleKey: "add a sitemap",
      prUrl: null,
      stage: null,
      createdAt: t0,
      updatedAt: t0,
      statusChangedAt: t0,
    },
    weekly: { seo: { now: 80, before: 74 }, geo: { now: 70, before: 70 }, aeo: null },
    indexing: {
      state: "counted",
      indexed: 3,
      checked: 53,
      unknown: 0,
      total: 60,
      byState,
      checkedThrough: null,
    },
    outside: {
      state: "ready",
      links: { count: 4, change: null, checkedAt: "2026-10-01", ownExcluded: true },
      ai: { asked: 5, named: 1, cited: 0, domains: [], checkedAt: "2026-10-01" },
    },
    content: { ready: 2, needsYou: 0, writing: 1, ideas: 4 },
    claudeTouchedAt: ago(2 * HOUR),
    ...over,
  };
}

const card = (over: Partial<RunwayFacts> = {}) => runwayCard(facts(over), t0, LONDON, "en-GB");

describe("runwayCard", () => {
  it("shows the verdict, trend, next action, check, highlights, content and Claude's touch", () => {
    expect(card()).toEqual({
      productId: "acme-docs",
      name: "Acme Docs",
      hue: "amber",
      verdict: expect.objectContaining({ label: "Good" }),
      trend: { direction: "up", phrase: "up 3 since last week" },
      next: { title: "Add a sitemap", href: "/actions#action-12" },
      checked: { phrase: "Checked 3 h ago.", tone: "ok" },
      highlights: [
        { term: "indexed", text: "In Google: 3 of 53 pages" },
        { term: "cited", text: "ChatGPT and others named you in 1 of 5 answers" },
        { term: "links-to-you", text: "4 sites link to you" },
      ],
      contentLine: "2 drafts ready for you · 1 being written · 4 ideas waiting",
      claudeLine: "Claude last updated this product's cards 2 h ago.",
    });
  });

  it("takes the verdict from the average of the areas that have a score", () => {
    const row = { ...facts().today.row, totals: { seo: 90, geo: null, aeo: 80 } };
    expect(card({ today: { ...facts().today, row } }).verdict.label).toBe("Strong");
  });

  it("has no verdict before the first check, with the reason", () => {
    const row = {
      ...facts().today.row,
      scanned: false,
      totals: { seo: null, geo: null, aeo: null },
    };
    const today = { ...facts().today, row, scannedAt: null };
    expect(card({ today })).toMatchObject({
      verdict: { label: "No score yet", sentence: "Not checked yet." },
      checked: { phrase: "Not checked yet.", tone: "unknown" },
    });
  });

  it("says the trend down, steady, or not at all with nothing to compare", () => {
    const down = { seo: { now: 60, before: 64 }, geo: null, aeo: null };
    expect(card({ weekly: down }).trend).toEqual({
      direction: "down",
      phrase: "down 4 since last week",
    });
    const steady = { seo: { now: 60, before: 60 }, geo: null, aeo: null };
    expect(card({ weekly: steady }).trend).toEqual({ direction: "steady", phrase: "steady" });
    expect(card({ weekly: { seo: null, geo: null, aeo: null } }).trend).toEqual({
      direction: null,
      phrase: null,
    });
  });

  it("tones the last check by the freshness rule", () => {
    const at = (scannedAt: Date, over = {}) =>
      card({ today: { ...facts().today, scannedAt, ...over } }).checked;
    expect(at(ago(30 * HOUR))).toEqual({
      phrase: "Last checked yesterday at 04:00.",
      tone: "watch",
    });
    expect(at(ago(MIN), { scanning: true })).toEqual({
      phrase: "Checking your sites now.",
      tone: "busy",
    });
    expect(at(ago(MIN), { failedAt: ago(MIN) })).toEqual({
      phrase: "The last check didn't finish.",
      tone: "act",
    });
  });

  it("skips highlights with no data, never saying 0 of 0", () => {
    const empty = card({
      indexing: { state: "empty", why: "not_connected", reason: null },
      outside: { state: "not_connected", links: null, ai: null },
    });
    expect(empty.highlights).toEqual([]);
    const unasked = card({
      indexing: null,
      outside: {
        state: "ready",
        links: null,
        ai: { asked: 0, named: 0, cited: 0, domains: [], checkedAt: "2026-10-01" },
      },
    });
    expect(unasked.highlights).toEqual([]);
    expect(card({ outside: null }).highlights).toEqual([
      { term: "indexed", text: "In Google: 3 of 53 pages" },
    ]);
  });

  it("leaves the content line out when content is off or nothing is in the works", () => {
    expect(card({ content: null }).contentLine).toBeNull();
    expect(
      card({ content: { ready: 0, needsYou: 0, writing: 0, ideas: 0 } }).contentLine,
    ).toBeNull();
    expect(card({ content: { ready: 1, needsYou: 1, writing: 0, ideas: 0 } }).contentLine).toBe(
      "1 draft ready for you · 1 draft needs you",
    );
  });

  it("says when Claude last touched the cards, or that it hasn't this week", () => {
    expect(card({ claudeTouchedAt: ago(3 * DAY) }).claudeLine).toBe(
      "Claude last updated this product's cards on 29 Sept.",
    );
    expect(card({ claudeTouchedAt: ago(8 * DAY) }).claudeLine).toBe(
      "Claude hasn't updated these cards this week.",
    );
    expect(card({ claudeTouchedAt: null }).claudeLine).toBe(
      "Claude hasn't updated these cards this week.",
    );
  });

  it("has no next action when nothing is active", () => {
    expect(card({ nextAction: null }).next).toBeNull();
  });
});
