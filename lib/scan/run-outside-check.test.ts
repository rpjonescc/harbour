import { getConfig } from "@/lib/config";
import { MICRO_PER_AUD } from "@/lib/costs/budget";
import { costs, externalChecks, jobs, scanRuns } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, eventsSince } from "@/lib/jobs/queue";
import {
  type FakeTregOptions,
  fakeFetch,
  fakeTreg,
  KEY,
  TRACKING,
} from "@/tests/helpers/fake-treg";
import { closeSites } from "@/tests/helpers/http-site";
import { DAY, setup } from "@/tests/helpers/scan-run";
import { createTreg } from "./collectors/treg";
import { runOutsideCheck } from "./run-outside-check";

afterEach(closeSites);

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);

async function harness(options: FakeTregOptions = {}, capAud = 1) {
  const server = await fakeTreg(options);
  const collector = createTreg({
    tracking: () => TRACKING,
    baseUrl: server.origin,
    timeoutMs: 5_000,
    clock: Date.now,
  });
  const h = setup([collector], {
    config: { ...getConfig(), HARBOUR_TREG_API_KEY: KEY, HARBOUR_USD_TO_AUD: 1.55 },
    fetch: fakeFetch(),
    budget: { capMicroAud: A$(capAud), timeZone: "UTC" },
  });
  /** Queues and runs one manual check, returning its finished job and events. */
  const manual = async () => {
    enqueueJob(
      h.db,
      "outside-check",
      { productId: "acme-docs" },
      "owner@example.com",
      h.deps.now(),
    );
    const job = claimNextJob(h.db, h.deps.now());
    if (!job) throw new Error("expected a job");
    await runOutsideCheck(h.deps, job);
    const done = h.db
      .select()
      .from(jobs)
      .all()
      .find((j) => j.id === job.id);
    return { job: done, events: eventsSince(h.db, job.id, 0).map((e) => e.text) };
  };
  return { ...h, server, manual };
}

const checks = (h: Awaited<ReturnType<typeof harness>>) => h.db.select().from(externalChecks).all();

describe("the outside-check job", () => {
  it("runs only the Treg collector and writes the history, without making a scan", async () => {
    const h = await harness();
    const { job, events } = await h.manual();
    expect(job).toMatchObject({ status: "ok", result: "ok", error: null });
    expect(h.server.calls).toHaveLength(4);
    expect(
      checks(h)
        .map((c) => c.kind)
        .sort(),
    ).toEqual(["ai_answer", "backlinks", "serp_rank", "serp_rank"]);
    expect(checks(h).every((c) => c.jobId === job?.id && c.scanId === null)).toBe(true);
    expect(h.db.select().from(scanRuns).all()).toEqual([]);
    expect(events.join("\n")).toContain("Outside view: kept 4 new checks");
    const rows = h.db.select().from(costs).all();
    expect(rows.map((r) => r.status)).toEqual(Array(4).fill("recorded"));
    expect(rows.every((r) => r.jobId === job?.id && r.productId === "acme-docs")).toBe(true);
  });

  it("writes the same check once: the same moment twice keeps nothing new", async () => {
    const h = await harness();
    await h.manual();
    const second = await h.manual();
    expect(checks(h)).toHaveLength(4);
    expect(second.events.join("\n")).toContain("kept 0 new checks");
  });

  it("ignores the weekly cadence: it runs the day after a scan, but not past the budget", async () => {
    const h = await harness();
    await h.scan();
    h.advance(DAY);
    const { job } = await h.manual();
    expect(job).toMatchObject({ status: "ok", result: "ok" });
    expect(h.server.calls).toHaveLength(8);
  });

  it("ignores the two-day backoff after calls that may have been billed", async () => {
    const h = await harness({ mode: (_e, n) => (n <= 3 ? "huge" : "ok") });
    await h.scan();
    expect(h.db.select().from(scanRuns).all()).toHaveLength(1);
    h.advance(DAY);
    const { job } = await h.manual();
    expect(job).toMatchObject({ status: "ok", result: "ok" });
  });

  it("is skipped, not failed, when the month's budget is used up", async () => {
    const h = await harness({}, 0);
    const { job, events } = await h.manual();
    expect(job).toMatchObject({ status: "ok", result: "skipped" });
    expect(job?.error).toContain("budget:");
    expect(h.server.calls).toEqual([]);
    expect(events.join("\n")).toContain("skipped");
  });

  it("stops at the budget midway and keeps the partial checks", async () => {
    const h = await harness({}, 0.02);
    const { job } = await h.manual();
    expect(job).toMatchObject({ status: "ok", result: "ok" });
    expect(checks(h)).toHaveLength(2);
  });

  it("respects a refused key until a restart", async () => {
    const h = await harness({ mode: (_e, n) => (n === 1 ? "unauthorized" : "ok") });
    await h.scan();
    const { job } = await h.manual();
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("paused");
    expect(h.server.calls).toHaveLength(1);
    expect(JSON.stringify([job, checks(h)])).not.toContain(KEY);
  });

  it("ignores a balance halt, and a good manual check ends it", async () => {
    const h = await harness({ mode: (_e, n) => (n === 1 ? "balance" : "ok") });
    await h.scan();
    // The scheduled run is paused for a day...
    h.advance(7 * DAY - 24 * 60 * 60_000 + 1);
    const { job } = await h.manual();
    expect(job).toMatchObject({ status: "ok", result: "ok" });
    // ...the manual check went through, so the next scheduled run is no longer held up.
    h.advance(DAY);
    await h.scan();
    expect(h.server.calls.length).toBeGreaterThan(5);
  });

  it("fails with the fixed sentence when the balance is still empty", async () => {
    const h = await harness({ mode: "balance" });
    const { job } = await h.manual();
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("Treg says its balance is empty: top it up, then run the check again.");
  });

  it("fails an unknown product", async () => {
    const h = await harness();
    enqueueJob(h.db, "outside-check", { productId: "nope" }, null, h.deps.now());
    const job = claimNextJob(h.db, h.deps.now());
    if (!job) throw new Error("expected a job");
    await runOutsideCheck(h.deps, job);
    expect(h.server.calls).toEqual([]);
    expect(h.db.select().from(jobs).all().at(-1)).toMatchObject({
      status: "failed",
      error: "Unknown product",
    });
  });
});
