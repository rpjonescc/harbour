import { FRESHNESS_RULES, type FreshnessRule, freshness, freshnessTone } from "./freshness";

const t0 = new Date("2026-10-02T09:00:00Z");
const ago = (ms: number) => new Date(t0.getTime() - ms);
const S = 1000;
const MIN = 60 * S;
const H = 60 * MIN;
const D = 24 * H;

describe("freshness", () => {
  const rule: FreshnessRule = { everyMs: 10 * MIN, graceMs: 5 * MIN };

  it("is never with no time at all", () => {
    expect(freshness(null, t0, rule)).toBe("never");
  });

  it("is fresh up to every + grace, late up to twice that, then stale", () => {
    expect(freshness(t0, t0, rule)).toBe("fresh");
    expect(freshness(ago(15 * MIN), t0, rule)).toBe("fresh");
    expect(freshness(ago(15 * MIN + 1), t0, rule)).toBe("late");
    expect(freshness(ago(30 * MIN), t0, rule)).toBe("late");
    expect(freshness(ago(30 * MIN + 1), t0, rule)).toBe("stale");
  });

  it("reads a time ahead of now as fresh", () => {
    expect(freshness(new Date(t0.getTime() + H), t0, rule)).toBe("fresh");
  });

  it.each([
    ["workerBeat", 2 * MIN, 4 * MIN],
    ["dailyCheck", 26 * H, 52 * H],
    ["backup", 26 * H, 52 * H],
    ["dailyNote", 25 * H, 50 * H],
    ["weeklyRun", 7 * D + 6 * H, 14 * D + 12 * H],
    ["monthlyRefresh", 32 * D, 64 * D],
  ] as const)("%s turns late after %i ms and stale after %i ms", (name, late, stale) => {
    const r = FRESHNESS_RULES[name];
    expect(freshness(ago(late), t0, r)).toBe("fresh");
    expect(freshness(ago(late + 1), t0, r)).toBe("late");
    expect(freshness(ago(stale), t0, r)).toBe("late");
    expect(freshness(ago(stale + 1), t0, r)).toBe("stale");
  });
});

describe("freshnessTone", () => {
  const beat = FRESHNESS_RULES.workerBeat;
  const check = FRESHNESS_RULES.dailyCheck;

  it("gives the worker ok at 90 s, watch at 3 min, act at 11 min and unknown with no beat", () => {
    expect(freshnessTone(ago(90 * S), t0, beat)).toBe("ok");
    expect(freshnessTone(ago(3 * MIN), t0, beat)).toBe("watch");
    expect(freshnessTone(ago(10 * MIN), t0, beat)).toBe("watch");
    expect(freshnessTone(ago(11 * MIN), t0, beat)).toBe("act");
    expect(freshnessTone(null, t0, beat)).toBe("unknown");
  });

  it("gives the daily check watch when late and act after 50 h", () => {
    expect(freshnessTone(ago(26 * H), t0, check)).toBe("ok");
    expect(freshnessTone(ago(27 * H), t0, check)).toBe("watch");
    expect(freshnessTone(ago(50 * H), t0, check)).toBe("watch");
    expect(freshnessTone(ago(50 * H + 1), t0, check)).toBe("act");
  });

  it("stays at watch, however stale, for a rule with no act limit", () => {
    expect(freshnessTone(ago(400 * D), t0, FRESHNESS_RULES.weeklyRun)).toBe("watch");
  });
});
