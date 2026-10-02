import type { RunOutcome } from "@/lib/agents/process";
import type { SpecReview } from "@/lib/agents/specs";
import { type Attempt, runReviewed } from "./run-reviewed";

const CLEAN: RunOutcome = {
  exitCode: 0,
  timedOut: false,
  cancelled: false,
  signal: null,
  stdoutTail: "",
  stderrTail: "",
};
const ok = (over: Partial<RunOutcome> = {}): Attempt => ({
  outcome: { ...CLEAN, ...over },
  result: undefined,
});

/** A clock the attempts advance, a review that rejects `rejections` times, and a call log. */
function harness(options: { rejections?: number; first?: Attempt; stopping?: boolean } = {}) {
  let clock = 0;
  let rejections = options.rejections ?? 0;
  const calls: { prompt: string; timeoutMs: number }[] = [];
  const log: string[] = [];
  const review: SpecReview = {
    check: () => (rejections-- > 0 ? "Because." : null),
    retryPrompt: (reason) => `retry: ${reason}`,
    reset: () => log.push("reset"),
    publish: () => {
      log.push("publish");
      return "digest";
    },
  };
  const run = (spec: { review?: SpecReview }, totalMs = 300_000) =>
    runReviewed({
      spec: { prompt: "first", ...spec },
      root: "/brain",
      totalMs,
      now: () => new Date(clock),
      stopping: () => options.stopping ?? false,
      event: (_kind, text) => log.push(text),
      attempt: async (prompt, timeoutMs) => {
        calls.push({ prompt, timeoutMs });
        clock += 100_000; // each attempt takes 100 s
        return calls.length === 1 ? (options.first ?? ok()) : ok();
      },
    });
  return { run, calls, log, review };
}

describe("runReviewed", () => {
  it("runs once, with the whole budget, when there is nothing to review", async () => {
    const h = harness();
    await h.run({});
    expect(h.calls).toEqual([{ prompt: "first", timeoutMs: 300_000 }]);
  });

  it("runs once when the output is accepted", async () => {
    const h = harness();
    await h.run({ review: h.review });
    expect(h.calls).toHaveLength(1);
    expect(h.log).toEqual([]);
  });

  it("clears the rejected draft and retries once, on the time that is left", async () => {
    const h = harness({ rejections: 5 });
    await h.run({ review: h.review });
    expect(h.calls).toEqual([
      { prompt: "first", timeoutMs: 300_000 },
      { prompt: "retry: Because.", timeoutMs: 200_000 }, // 300 s total, 100 s already used
    ]);
    expect(h.log[0]).toMatch(/rejected the output \(Because\.\); asking the agent once more/);
    expect(h.log[1]).toBe("reset");
    expect(h.calls).toHaveLength(2); // never a third try
  });

  it("does not retry when the first attempt used up the whole budget", async () => {
    const h = harness({ rejections: 5 });
    const { outcome } = await h.run({ review: h.review }, 100_000);
    expect(h.calls).toHaveLength(1);
    expect(h.log.join("|")).toMatch(/no time left/);
    expect(outcome.exitCode).toBe(0);
  });

  it.each([
    ["a CLI failure", ok({ exitCode: 1 })],
    ["a timeout", ok({ timedOut: true })],
    ["a cancel", ok({ cancelled: true })],
    ["an error result", { outcome: CLEAN, result: { isError: true, text: "x" } }],
  ])("does not retry after %s", async (_name, first) => {
    const h = harness({ rejections: 5, first });
    await h.run({ review: h.review });
    expect(h.calls).toHaveLength(1);
  });

  it("does not retry once the worker is stopping", async () => {
    const h = harness({ rejections: 5, stopping: true });
    await h.run({ review: h.review });
    expect(h.calls).toHaveLength(1);
  });

  it("returns the last attempt", async () => {
    const h = harness({ rejections: 1, first: ok({ stdoutTail: "one" }) });
    const last = await h.run({ review: h.review });
    expect(last.outcome.stdoutTail).toBe("");
  });
});
