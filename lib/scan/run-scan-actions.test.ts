import { vi } from "vitest";
import { actionEventsFor } from "@/lib/actions/store";
import { actions, scanRuns, scores } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { getJob } from "@/lib/jobs/queue";
import {
  DAY,
  fake,
  ok,
  product,
  returns,
  setup,
  t0,
  texts,
  throws,
} from "@/tests/helpers/scan-run";
import { ACME_CRAWL, crawlSite, htmlPage, readiness } from "@/tests/helpers/scoring";
import { scoreScan } from "./score";
import type { CollectorResult, Observation, ScanObservation } from "./types";
import { workerScanDeps } from "./worker-deps";

const strip = ({ collector: _, ...observation }: ScanObservation): Observation => observation;

/** A crawler whose next result the test sets: untitled home page, titled one, or a failure. */
function switchableCrawler() {
  let mode: "untitled" | "titled" | "fails" = "untitled";
  const crawl = (titleLength: number): CollectorResult => ({
    status: "ok",
    observations: [
      htmlPage("/", { titleLength, title: titleLength ? "Acme Docs home" : "" }),
      crawlSite({ brokenInternalLinks: [] }),
    ].map(strip),
  });
  const collector = fake("crawler", async () => {
    if (mode === "fails") throw new Error("connection refused");
    return crawl(mode === "untitled" ? 0 : 14);
  });
  return { collector, set: (next: typeof mode) => (mode = next) };
}

/** A scan setup that syncs actions exactly as the worker does. */
function workerSetup() {
  const crawler = switchableCrawler();
  const run = setup([crawler.collector, ok("readiness")]);
  run.deps.afterScore = workerScanDeps(run.deps).afterScore;
  const day = (ms: number) => isoDateIn(run.deps.config.HARBOUR_TIMEZONE, new Date(ms));
  return { ...run, crawler, day };
}

const titleActions = (run: ReturnType<typeof workerSetup>) =>
  run.db
    .select()
    .from(actions)
    .all()
    .filter((a) => a.ruleKey === "missing-title");

describe("runScan action sync", () => {
  it("creates an action for a found issue and reports the sync as a job event", async () => {
    const run = workerSetup();
    const job = await run.scan();
    const [action] = titleActions(run);
    expect(action).toMatchObject({ productId: "acme-docs", status: "open", issuePresent: true });
    expect(texts(run.db, job)).toContain("Actions: 1 new, 0 resolved, 0 reopened");
  });

  it("keeps an open action open when the crawler failed", async () => {
    const run = workerSetup();
    await run.scan();
    run.crawler.set("fails");
    run.advance(DAY);
    const job = await run.scan();
    expect(getJob(run.db, job.id)?.status).toBe("ok");
    expect(titleActions(run)).toEqual([
      expect.objectContaining({ status: "open", issuePresent: true }),
    ]);
    expect(texts(run.db, job)).toContain("Actions: 0 new, 0 resolved, 0 reopened");
  });

  it("marks the action done when a later scan no longer finds the issue", async () => {
    const run = workerSetup();
    await run.scan();
    run.crawler.set("titled");
    run.advance(DAY);
    const job = await run.scan();
    const [action] = titleActions(run);
    expect(action).toMatchObject({ status: "done", issuePresent: false });
    expect(actionEventsFor(run.db, action?.id ?? -1).at(-1)).toMatchObject({
      actor: "scan",
      from: "open",
      to: "done",
      note: `Resolved — not found in the check of ${run.day(t0.getTime() + DAY)}`,
    });
    expect(texts(run.db, job)).toContain("Actions: 0 new, 1 resolved, 0 reopened");
  });

  it("does not sync a scan that is not the product's latest good scan", async () => {
    const run = workerSetup();
    await run.scan();
    const [first] = run.db.select().from(scanRuns).all();
    run.crawler.set("titled");
    run.advance(DAY);
    await run.scan();
    const afterScore = run.deps.afterScore;
    if (!first || !afterScore) throw new Error("expected a scan and the worker's sync");
    const statuses = { crawler: "ok", readiness: "ok" } as const;
    expect(afterScore({ scanId: first.id, product, statuses, jobId: 1 })).toBe(
      `Actions: not synced — scan ${first.id} is not the latest good scan of Acme Docs`,
    );
    expect(titleActions(run)).toEqual([expect.objectContaining({ status: "done" })]);
  });

  it("does not sync after a failed scan", async () => {
    const afterScore = vi.fn(() => "synced");
    const { scan } = setup([throws("crawler"), throws("readiness")], { afterScore });
    await scan();
    expect(afterScore).not.toHaveBeenCalled();
  });

  it("fails the job when the sync throws, keeping the scan and its scores", async () => {
    const crawler = returns("crawler", { status: "ok", observations: ACME_CRAWL.map(strip) });
    const ready = returns("readiness", { status: "ok", observations: [strip(readiness())] });
    const afterScore = vi.fn(() => {
      throw new Error("database is locked");
    });
    const { db, scan } = setup([crawler, ready], { scoreScan, afterScore });
    const job = await scan();
    expect(afterScore).toHaveBeenCalledWith({
      scanId: expect.any(Number),
      product: expect.objectContaining({ id: "acme-docs" }),
      statuses: { crawler: "ok", readiness: "ok" },
      jobId: job.id,
    });
    expect(getJob(db, job.id)).toMatchObject({
      status: "failed",
      error: "Action sync failed: database is locked",
    });
    expect(texts(db, job)).toContain("Action sync failed: database is locked");
    expect(db.select().from(scanRuns).all()).toEqual([expect.objectContaining({ status: "ok" })]);
    expect(db.select().from(scores).all()).toHaveLength(1);
  });
});
