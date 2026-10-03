import {
  DOMAIN,
  fakeTreg,
  KEY,
  type Mode,
  observed,
  TRACKING,
  tregRun,
} from "@/tests/helpers/fake-treg";
import { closeSites } from "@/tests/helpers/http-site";
import { tregSummaryValue } from "../treg-shapes";

afterEach(closeSites);

const BACKLINKS = "serpstat.web.backlinks.summary";
const SERP = "dataforseo.google.serp.organic";
const AI = "cloro.ai-search.chatgpt.scrape";
const only =
  (endpoint: string, mode: Mode) =>
  (asked: string): Mode =>
    asked === endpoint ? mode : "ok";
const summaryOf = (result: Awaited<ReturnType<typeof tregRun>>["result"]) =>
  tregSummaryValue.parse(observed(result, "treg_summary")[0]?.value);

describe("treg collector: one check failing never hides the others", () => {
  it.each([
    ["a 402 over the ceiling", "route_max_cost", "above_ceiling"],
    ["a 5xx", "server_error", "server"],
    ["an unknown endpoint (404)", "unknown_endpoint", "retired"],
    ["malformed JSON", "malformed", "unreadable"],
    ["an answer of the wrong shape", "wrong_shape", "unreadable"],
  ] as const)("records %s for the searches and carries on", async (_name, mode, reason) => {
    const { origin, calls } = await fakeTreg({ mode: only(SERP, mode) });
    const run = await tregRun({ origin });
    expect(run.result?.status).toBe("ok");
    expect(observed(run.result, "backlinks")).toHaveLength(1);
    expect(observed(run.result, "serp_rank")).toHaveLength(0);
    expect(observed(run.result, "ai_answer")).toHaveLength(1);
    expect(summaryOf(run.result)).toMatchObject({
      attempted: 4,
      ok: 2,
      failed: 2,
      stoppedBy: "done",
    });
    expect(summaryOf(run.result).problems).toEqual([
      { check: "serp_rank", subject: "acme docs", reason },
      { check: "serp_rank", subject: "best docs tools", reason },
    ]);
    // Asked once each, never retried.
    expect(calls).toHaveLength(4);
  });

  it("keeps the backlinks and searches when the AI check hangs, and records its estimate", async () => {
    const { origin } = await fakeTreg({ mode: only(AI, "hang") });
    const run = await tregRun({ origin, timeoutMs: 150 });
    expect(run.result?.status).toBe("ok");
    expect(observed(run.result, "ai_answer")).toHaveLength(0);
    expect(summaryOf(run.result).problems).toEqual([
      { check: "ai_answer", subject: TRACKING.questions[0], reason: "timeout" },
    ]);
    // A call that was sent and timed out may have been billed: counted at its estimate.
    expect(run.spent.recorded.map((r) => r.amountMicroAud)).toEqual([3_875, 9_300, 9_300, 5_580]);
  });

  it("fails a check whose answer is over 1 MiB, and counts its estimate", async () => {
    const { origin } = await fakeTreg({ mode: only(BACKLINKS, "huge") });
    const run = await tregRun({ origin });
    expect(summaryOf(run.result).problems).toEqual([
      { check: "backlinks", subject: DOMAIN, reason: "unreadable" },
    ]);
    expect(run.spent.recorded[0]).toEqual({ provider: "treg", units: 1, amountMicroAud: 3_875 });
  });

  it("records no cost for a ceiling refusal: nothing was charged", async () => {
    const { origin } = await fakeTreg({ mode: only(SERP, "route_max_cost") });
    const run = await tregRun({ origin });
    expect(run.spent.recorded.map((r) => r.amountMicroAud)).toEqual([3_875, 5_580]);
  });

  it("stops asking after three failures in a row, and fails when nothing was answered", async () => {
    const { origin, calls } = await fakeTreg({ mode: "server_error" });
    const run = await tregRun({ origin });
    expect(run.result).toBeNull();
    expect(run.error?.message).toBe(
      "None of the outside-view checks could be completed this time.",
    );
    expect(calls).toHaveLength(3);
  });

  it("does not count ceiling refusals or retired endpoints toward the failures in a row", async () => {
    const { origin, calls } = await fakeTreg({ mode: "route_max_cost" });
    const run = await tregRun({ origin });
    expect(calls).toHaveLength(4);
    expect(run.error?.message).toBe(
      "None of the outside-view checks could be completed this time.",
    );
  });
});

describe("treg collector: reasons that end the run", () => {
  it.each([
    ["a 401", "unauthorized", "key"],
    ["a 403", "forbidden", "key"],
    ["a 402 that is not the ceiling", "balance", "balance"],
  ] as const)("ends on %s at once with a fixed sentence", async (_name, mode, which) => {
    const { origin, calls } = await fakeTreg({ mode });
    const run = await tregRun({ origin });
    expect(calls).toHaveLength(1);
    expect(run.error?.message).toBe(
      which === "key"
        ? "Treg refused Harbour's key: check HARBOUR_TREG_API_KEY in .env, then restart the worker."
        : "Treg says its balance is empty: top it up, then run the check again.",
    );
    expect(run.error?.cause).toBeUndefined();
    expect(run.spent.recorded).toEqual([]);
  });

  it("ends on a 429 with a fixed sentence", async () => {
    const { origin, calls } = await fakeTreg({ mode: "rate_limit" });
    const run = await tregRun({ origin });
    expect(calls).toHaveLength(1);
    expect(run.error?.message).toBe(
      "Treg is limiting how fast Harbour may ask: the check will run again later.",
    );
  });

  it.each([
    ["balance", "balance"],
    ["rate_limit", "error"],
  ] as const)("keeps the partial results when %s stops it midway", async (mode, stoppedBy) => {
    const { origin, calls } = await fakeTreg({
      mode: (_endpoint, n) => (n >= 3 ? mode : "ok"),
    });
    const run = await tregRun({ origin });
    expect(run.result?.status).toBe("ok");
    expect(observed(run.result, "backlinks")).toHaveLength(1);
    expect(observed(run.result, "serp_rank")).toHaveLength(1);
    expect(summaryOf(run.result)).toMatchObject({ attempted: 2, ok: 2, failed: 0, stoppedBy });
    expect(calls).toHaveLength(3);
  });

  it("stops when the run's own time is up, keeping what it has", async () => {
    const { origin, calls } = await fakeTreg();
    const times = [0, 0, 9 * 60_000];
    let i = 0;
    const clock = () => times[Math.min(i++, times.length - 1)] ?? 0;
    const run = await tregRun({ origin, clock });
    expect(calls).toHaveLength(1);
    expect(summaryOf(run.result)).toMatchObject({ ok: 1, stoppedBy: "error" });
  });

  it("rethrows an abort instead of recording a failed check", async () => {
    const { origin, calls } = await fakeTreg({ mode: "hang" });
    const controller = new AbortController();
    const pending = tregRun({ origin, signal: controller.signal, timeoutMs: 5_000 });
    setTimeout(() => controller.abort(new Error("cancelled")), 100);
    const run = await pending;
    expect(run.result).toBeNull();
    expect(run.error).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(run.error?.message)).not.toContain(KEY);
  });
});

describe("treg collector: spending", () => {
  it("asks the budget before each call with the estimate in micro-AUD, and records the actual", async () => {
    const { origin } = await fakeTreg();
    const run = await tregRun({ origin, rate: 1.55 });
    expect(run.spent.estimates).toEqual([3_875, 9_300, 9_300, 5_580]);
    expect(run.spent.recorded).toEqual([
      { provider: "treg", units: 1, amountMicroAud: 3_875 },
      { provider: "treg", units: 1, amountMicroAud: 9_300 },
      { provider: "treg", units: 1, amountMicroAud: 9_300 },
      { provider: "treg", units: 1, amountMicroAud: 5_580 },
    ]);
  });

  it("converts at HARBOUR_USD_TO_AUD, for the reservation and the record alike", async () => {
    const { origin } = await fakeTreg();
    const run = await tregRun({ origin, rate: 2 });
    expect(run.spent.estimates).toEqual([5_000, 12_000, 12_000, 7_200]);
    expect(run.spent.recorded.map((r) => r.amountMicroAud)).toEqual([5_000, 12_000, 12_000, 7_200]);
  });

  it("stops at the budget midway: partial results are kept and summarised", async () => {
    const { origin, calls } = await fakeTreg();
    const run = await tregRun({ origin, allowCalls: 2 });
    expect(run.result?.status).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(summaryOf(run.result)).toMatchObject({
      attempted: 2,
      ok: 2,
      spentMicroUsd: 8_500,
      stoppedBy: "budget",
    });
    expect(run.spent.recorded).toHaveLength(2);
  });

  it("is skipped when the budget refuses the very first call", async () => {
    const { origin, calls } = await fakeTreg();
    const run = await tregRun({ origin, allowCalls: 0 });
    expect(run.result).toEqual({
      status: "skipped",
      reason: "budget: the monthly budget does not cover the next outside-view check",
    });
    expect(calls).toEqual([]);
    expect(run.spent.recorded).toEqual([]);
  });

  it.each([
    ["missing", "no_cost_header"],
    ["not a number", "bad_cost_header"],
  ] as const)(
    "records the estimate, never zero, when the cost header is %s",
    async (_name, mode) => {
      const { origin } = await fakeTreg({ mode: only(BACKLINKS, mode) });
      const run = await tregRun({ origin });
      expect(run.spent.recorded[0]?.amountMicroAud).toBe(3_875);
      expect(run.log).toContain(
        "A call's cost was missing or unreadable: its estimate was recorded",
      );
      expect(run.result?.status).toBe("ok");
    },
  );

  it("records the reported charge when it differs from the estimate", async () => {
    const { origin } = await fakeTreg({ charges: { [BACKLINKS]: "2000" } });
    const run = await tregRun({ origin });
    expect(run.spent.recorded[0]?.amountMicroAud).toBe(3_100);
    expect(summaryOf(run.result).spentMicroUsd).toBe(2_000 + 6_000 + 6_000 + 3_600);
  });

  it("records the estimate when the reported charge is implausible (over US$1)", async () => {
    const { origin } = await fakeTreg({ charges: { [BACKLINKS]: "5000000" } });
    const run = await tregRun({ origin });
    expect(run.spent.recorded[0]?.amountMicroAud).toBe(3_875);
    expect(run.result?.status).toBe("ok");
  });

  it("records a reported zero charge as zero: a real figure is not an estimate", async () => {
    const { origin } = await fakeTreg({ charges: { [BACKLINKS]: "0" } });
    const run = await tregRun({ origin });
    expect(run.spent.recorded[0]?.amountMicroAud).toBe(0);
  });
});

describe("treg collector: hostile input", () => {
  it("sends search text only in the JSON body, never as a header", async () => {
    const evil = "acme\r\nX-Evil: 1\r\n\r\nGET /";
    const { origin, calls } = await fakeTreg();
    const tracking = { ...TRACKING, queries: [evil], questions: ["why\r\nX-Evil2: 1"] };
    const run = await tregRun({ origin, tracking });
    expect(run.result?.status).toBe("ok");
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.headers["x-evil"]).toBeUndefined();
      expect(call.headers["x-evil2"]).toBeUndefined();
    }
    expect(JSON.stringify(calls[1]?.json)).toContain(JSON.stringify(evil).slice(1, -1));
  });

  it("treats a weird product name and a hostile answer as plain data", async () => {
    const { origin } = await fakeTreg({
      answers: {
        text: `${"a".repeat(50_000)} <script>alert(1)</script> \u202e`,
        sources: ["javascript:alert(1)"],
      },
    });
    const run = await tregRun({ origin, product: { name: "(((" } });
    expect(observed(run.result, "ai_answer")[0]?.value).toMatchObject({
      named: false,
      cited: false,
      citedDomains: [],
    });
    expect(JSON.stringify(run.result)).not.toContain("script");
  });
});
