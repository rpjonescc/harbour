import { ago, DAY, HOUR, job, LONDON, PRODUCTS, schedule, t0 } from "@/tests/helpers/tower";
import { agentsLight, scheduleLight, spendLight } from "./system-more";

const words = { now: t0, timeZone: LONDON, locale: "en-GB" };

describe("scheduleLight", () => {
  const daily = schedule("scan", "Daily check");
  const weekly = schedule("analyst", "Weekly report");
  const ran = (at: Date) => ({ status: "ok" as const, at });

  it("is fine when every schedule that is on ran on time", () => {
    const off = schedule("refresh", "Monthly research refresh", { enabled: false });
    expect(
      scheduleLight(
        [
          { row: daily, lastRun: ran(ago(5 * HOUR)) },
          { row: weekly, lastRun: ran(ago(6 * DAY)) },
          { row: off, lastRun: null },
        ],
        words,
      ),
    ).toEqual({ tone: "ok", sentence: "All 2 schedules ran on time." });
    expect(scheduleLight([{ row: daily, lastRun: ran(ago(HOUR)) }], words).sentence).toBe(
      "The one schedule that's on ran on time.",
    );
  });

  it("is switched off when no schedule is on", () => {
    const off = { ...daily, enabled: false };
    expect(scheduleLight([{ row: off, lastRun: null }], words)).toEqual({
      tone: "off",
      sentence: "Every schedule is switched off.",
    });
  });

  it("is worth a look when a schedule is overdue or its last run failed", () => {
    expect(scheduleLight([{ row: daily, lastRun: ran(ago(27 * HOUR)) }], words)).toEqual({
      tone: "watch",
      sentence: "Daily check: last ran yesterday at 07:00.",
    });
    const failed = { status: "failed" as const, at: ago(3 * DAY) };
    expect(scheduleLight([{ row: weekly, lastRun: failed }], words)).toEqual({
      tone: "watch",
      sentence: "Weekly report: didn't finish on 29 Sept.",
    });
  });

  it("can't tell for a schedule that has never run, and says the worst first when several", () => {
    expect(scheduleLight([{ row: weekly, lastRun: null }], words)).toEqual({
      tone: "unknown",
      sentence: "Weekly report: hasn't run yet.",
    });
    expect(
      scheduleLight(
        [
          { row: weekly, lastRun: null },
          { row: daily, lastRun: ran(ago(3 * DAY)) },
        ],
        words,
      ),
    ).toEqual({
      tone: "watch",
      sentence: "2 schedules need a look. Daily check: last ran on 29 Sept.",
    });
  });
});

describe("agentsLight", () => {
  const agents = { running: [], queued: [], failedUnretried: [], finishedToday: 0 };

  it("is fine and says what finished today when nothing runs", () => {
    expect(agentsLight(agents, PRODUCTS)).toEqual({ tone: "ok", sentence: "Nothing running." });
    expect(agentsLight({ ...agents, finishedToday: 1 }, PRODUCTS).sentence).toBe(
      "Nothing running. 1 run finished today.",
    );
  });

  it("is busy with the running job's label, and counts what waits", () => {
    const running = [
      job({ kind: "discovery", params: { productId: "acme-docs" }, status: "running" }),
    ];
    expect(agentsLight({ ...agents, running, queued: [job(), job()] }, PRODUCTS)).toEqual({
      tone: "busy",
      sentence: "Running now: Find ideas: Acme Docs. 2 more waiting.",
    });
    expect(agentsLight({ ...agents, queued: [job()] }, PRODUCTS)).toEqual({
      tone: "busy",
      sentence: "1 run is waiting to start.",
    });
  });

  it("is worth a look when a run failed and was not retried, even while another runs", () => {
    const failed = [
      job({ kind: "content-ideas", params: { productId: "acme-blog" }, status: "failed" }),
    ];
    const running = [job({ status: "running" })];
    expect(agentsLight({ ...agents, failedUnretried: failed, running }, PRODUCTS)).toEqual({
      tone: "watch",
      sentence: "A run didn't finish (Ideas: Acme Blog).",
    });
    expect(agentsLight({ ...agents, failedUnretried: [job(), job()] }, PRODUCTS).sentence).toBe(
      "2 runs didn't finish.",
    );
  });
});

describe("spendLight", () => {
  const spend = { spentMicro: 4_100_000, unconfirmedMicro: 0 };
  const capped = { ...spend, capMicro: 20_000_000, projectedMicro: null };

  it("is fine with no paid data or no budget, saying so", () => {
    expect(spendLight({ state: "no-paid-sources", ...spend }, words)).toEqual({
      tone: "ok",
      sentence:
        "No paid data connected — Harbour is using free data only, so nothing is being spent.",
    });
    expect(spendLight({ state: "no-budget", ...spend }, words)).toEqual({
      tone: "ok",
      sentence: "Paid data is off until you set a monthly budget.",
    });
  });

  it("says the month's spend against the budget when fine", () => {
    expect(spendLight({ state: "ok", ...capped }, words)).toEqual({
      tone: "ok",
      sentence: "A$4.10 of A$20.00 this month.",
    });
  });

  it("is worth a look near the budget and the owner's when it is reached", () => {
    const near = { ...capped, state: "warn" as const, spentMicro: 17_000_000 };
    expect(spendLight(near, words)).toEqual({
      tone: "watch",
      sentence: "85% of this month's budget used.",
    });
    const over = { ...capped, state: "reached" as const, spentMicro: 21_000_000 };
    expect(spendLight(over, words)).toEqual({
      tone: "act",
      sentence: "Budget reached — paid data is paused until 1 Nov.",
    });
  });
});
