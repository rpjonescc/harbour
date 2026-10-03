import { TREG_PROBLEM_TEXT, TREG_REASONS } from "@/lib/explain/treg";
import {
  aiAnswerValue,
  backlinksValue,
  serpRankValue,
  TREG_PROBLEMS,
  tregSummaryValue,
} from "./treg-shapes";

const at = "2026-10-04T06:00:00.000Z";

describe("serpRankValue", () => {
  const base = { query: "acme docs", url: null, topDomains: [], checkedAt: at };

  it("takes null for 'not in the top 30' and 1 to 30 otherwise, never 0 or 31", () => {
    expect(serpRankValue.safeParse({ ...base, position: null }).success).toBe(true);
    expect(serpRankValue.safeParse({ ...base, position: 1 }).success).toBe(true);
    expect(serpRankValue.safeParse({ ...base, position: 30 }).success).toBe(true);
    expect(serpRankValue.safeParse({ ...base, position: 0 }).success).toBe(false);
    expect(serpRankValue.safeParse({ ...base, position: 31 }).success).toBe(false);
    expect(serpRankValue.safeParse({ ...base, position: 2.5 }).success).toBe(false);
  });

  it("allows at most 5 top domains, and only http(s) URLs", () => {
    const six = Array.from({ length: 6 }, (_, i) => `s${i}.example.net`);
    expect(serpRankValue.safeParse({ ...base, position: 1, topDomains: six }).success).toBe(false);
    const javascript = { ...base, position: 1, url: "javascript:alert(1)" };
    expect(serpRankValue.safeParse(javascript).success).toBe(false);
  });
});

describe("the other observation shapes", () => {
  it("refuse a missing check time and bad counts", () => {
    const ok = {
      referringDomains: 1,
      backlinks: 1,
      dofollow: 1,
      rank: null,
      provider: "serpstat",
      checkedAt: at,
    };
    expect(backlinksValue.safeParse(ok).success).toBe(true);
    expect(backlinksValue.safeParse({ ...ok, checkedAt: "soon" }).success).toBe(false);
    expect(backlinksValue.safeParse({ ...ok, backlinks: -1 }).success).toBe(false);
  });

  it("limit cited domains to 8 and keep businessesNamed nullable", () => {
    const ok = {
      question: "q?",
      named: false,
      cited: false,
      citedDomains: [],
      businessesNamed: null,
      checkedAt: at,
    };
    expect(aiAnswerValue.safeParse(ok).success).toBe(true);
    const nine = Array.from({ length: 9 }, (_, i) => `s${i}.example.org`);
    expect(aiAnswerValue.safeParse({ ...ok, citedDomains: nine }).success).toBe(false);
  });

  it("only accept a summary that stopped for a known reason", () => {
    const ok = {
      attempted: 1,
      ok: 1,
      failed: 0,
      spentMicroUsd: 2500,
      stoppedBy: "done",
      problems: [],
    };
    expect(tregSummaryValue.safeParse(ok).success).toBe(true);
    expect(tregSummaryValue.safeParse({ ...ok, stoppedBy: "whim" }).success).toBe(false);
    expect(
      tregSummaryValue.safeParse({
        ...ok,
        problems: [{ check: "x", subject: "", reason: "server" }],
      }).success,
    ).toBe(false);
  });
});

describe("the fixed sentences", () => {
  it("has plain text for every problem code", () => {
    for (const code of TREG_PROBLEMS) expect(TREG_PROBLEM_TEXT[code].length).toBeGreaterThan(10);
  });

  it("keeps the key's setting name out of everything but the setup sentences", () => {
    const withSetting = Object.entries(TREG_REASONS).filter(([, text]) => /HARBOUR_/.test(text));
    expect(withSetting.map(([name]) => name)).toEqual(["noKey", "key"]);
  });
});
