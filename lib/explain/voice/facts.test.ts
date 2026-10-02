import { factsInput as input } from "@/tests/helpers/note";
import { buildFacts, FACT_CAPS, figuresOf, numbersIn } from "./facts";

describe("buildFacts", () => {
  it("describes the moment in the owner's words", () => {
    expect(buildFacts(input())).toMatchObject({
      date: "2026-10-02",
      weekday: "Friday",
      time: "06:30",
      dayPart: "morning",
      rest: null,
      ownerFirstName: "Sam",
    });
    expect(
      buildFacts(input({ local: { day: "2026-10-03", weekday: "Saturday", hour: 9, minute: 5 } })),
    ).toMatchObject({
      time: "09:05",
      rest: "weekend",
    });
  });

  it("gives each scored area its verdict and change, and lists the missing ones as gaps", () => {
    const [acme, cafe] = buildFacts(input()).products;
    expect(acme).toEqual({
      name: "Acme Docs",
      areas: [
        {
          name: "Found on Google",
          score: 62,
          verdict: "Fair",
          change: "up 3 since the last check",
        },
        { name: "Recommended by AI assistants", score: 41, verdict: "Needs work", change: null },
      ],
      noScoreYet: ["Answer-ready"],
    });
    expect(cafe?.areas.map((a) => [a.score, a.change])).toEqual([
      [80, "steady"],
      [55, "steady"],
      [48, "steady"],
    ]);
    expect(cafe?.noScoreYet).toEqual([]);
  });

  it("never turns a missing score into a number", () => {
    const [only] = buildFacts(
      input({
        products: [
          {
            name: "Acme Docs",
            scores: { seo: null, geo: null, aeo: null },
            deltas: { seo: null, geo: null, aeo: null },
            scoredLast24h: false,
          },
        ],
      }),
    ).products;
    expect(only?.areas).toEqual([]);
    expect(only?.noScoreYet).toEqual([
      "Found on Google",
      "Recommended by AI assistants",
      "Answer-ready",
    ]);
  });

  it("lists the active actions in plain phrases, and the wins of the last day", () => {
    const facts = buildFacts(input());
    expect(facts.actions).toEqual([
      {
        id: 1,
        title: "Add a short guide to your site for AI assistants",
        howBig: "Big win",
        howLong: "quick job",
        whoOnIt: "Waiting for you",
      },
      {
        id: 2,
        title: "Answer opening-hours questions in one line",
        howBig: "Worth doing",
        howLong: "quick job",
        whoOnIt: "Waiting for you",
      },
    ]);
    expect(facts.wins).toEqual([
      "Finished: Fix the missing page titles",
      "Found on Google for Acme Docs is up 3 since the last check",
    ]);
  });

  it("counts a score rise as a win only when the scan was in the last day", () => {
    const stale = input();
    const [first, ...rest] = stale.products;
    if (!first) throw new Error("fixture has products");
    const facts = buildFacts({ ...stale, products: [{ ...first, scoredLast24h: false }, ...rest] });
    expect(facts.wins).toEqual(["Finished: Fix the missing page titles"]);
  });

  it("keeps trouble and recent headlines as given, in plain strings", () => {
    const facts = buildFacts(input({ trouble: ["the last backup didn't finish"] }));
    expect(facts.trouble).toEqual(["the last backup didn't finish"]);
    expect(facts.recentHeadlines).toEqual(["Calm waters this morning"]);
  });

  it("caps every list, clips long text and collapses line breaks", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `item ${i}`);
    const facts = buildFacts(
      input({
        finishedTitles: many(20),
        trouble: many(20),
        recentHeadlines: many(20),
        actions: Array.from({ length: 30 }, (_, i) => ({
          id: i,
          title: `Do thing ${i}\nnext line ${"x".repeat(300)}`,
          impact: "low" as const,
          effort: "large" as const,
          who: null,
        })),
      }),
    );
    expect(facts.actions).toHaveLength(FACT_CAPS.actions);
    expect(facts.trouble).toHaveLength(FACT_CAPS.trouble);
    expect(facts.recentHeadlines).toHaveLength(FACT_CAPS.headlines);
    expect(facts.wins.length).toBeLessThanOrEqual(FACT_CAPS.wins);
    for (const action of facts.actions) {
      expect(action.title).not.toMatch(/\n/);
      expect(action.title.length).toBeLessThanOrEqual(FACT_CAPS.text);
    }
    expect(JSON.stringify(facts).length).toBeLessThan(8_000);
  });

  it("holds no secrets, paths or settings", () => {
    expect(JSON.stringify(buildFacts(input()))).not.toMatch(/HARBOUR_|token|\/home\/|\.env/i);
  });
});

describe("numbersIn and figuresOf", () => {
  it("reads digits, decimals and thousands separators", () => {
    expect(numbersIn("up 3 since 06:30, 1,200 visits and 2.5 seconds")).toEqual([
      3, 6, 30, 1200, 2.5,
    ]);
    expect(numbersIn("no figures here")).toEqual([]);
  });

  it("allows scores, changes, counts, the time and figures in the facts' own sentences", () => {
    const figures = figuresOf(
      buildFacts(input({ trouble: ["2 data sources had a problem in the last check"] })),
    );
    for (const n of [62, 41, 80, 55, 48, 3, 2, 1, 6, 30]) expect(figures.has(n)).toBe(true);
    expect(figures.has(93)).toBe(false);
  });
});
