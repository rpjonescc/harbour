import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { snapshotRun } from "@/lib/agents/brain-git";
import { jobs } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import type { HousekeepingAction } from "./housekeeping";
import { claimNextJob, enqueueJob, eventsSince, finishJob, getJob, heartbeat } from "./queue";
import { pendingRecovery, type RecoveryResult, writeRunMarker } from "./run-marker";
import { makeScheduler, pushRetryDelay } from "./scheduler";

const MIN = 60_000;

function harness(decide: (pushRetryDue: boolean) => HousekeepingAction | null) {
  const db = openTestDb();
  const quarantineRoot = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  let now = 0;
  const scheduler = makeScheduler({
    db,
    root: "/nonexistent-brain",
    quarantineRoot,
    clock: () => now,
    action: (_root, _now, opts) => decide(opts.pushRetryDue),
  });
  const kinds = () =>
    db
      .select({ kind: jobs.kind })
      .from(jobs)
      .all()
      .map((j) => j.kind);
  /** Runs the queued job (if any) to completion. */
  const settle = (ok: boolean) => {
    const job = claimNextJob(db);
    if (!job) throw new Error("expected a queued job");
    finishJob(db, job.id, ok ? "ok" : "failed", null);
    return job;
  };
  return {
    db,
    scheduler,
    kinds,
    settle,
    at: (ms: number) => {
      now = ms;
      scheduler.tick();
    },
    cleanup: () => rmSync(quarantineRoot, { recursive: true, force: true }),
  };
}

describe("pushRetryDelay", () => {
  it("doubles from 10 minutes per consecutive failure, capped at 6 hours", () => {
    expect([0, 1, 2, 3].map(pushRetryDelay)).toEqual([10 * MIN, 10 * MIN, 20 * MIN, 40 * MIN]);
    expect(pushRetryDelay(50)).toBe(6 * 60 * MIN);
  });
});

describe("makeScheduler", () => {
  it("backs off push retries after consecutive failures and resets on success", () => {
    const h = harness((due) => (due ? "brain-push" : null));
    try {
      h.at(0);
      expect(h.kinds()).toEqual(["brain-push"]);
      h.settle(false);
      h.scheduler.pushed(false);
      h.at(9 * MIN);
      h.at(10 * MIN);
      expect(h.kinds()).toHaveLength(2);
      h.settle(false);
      h.scheduler.pushed(false);
      h.at(29 * MIN);
      expect(h.kinds()).toHaveLength(2);
      h.at(30 * MIN);
      expect(h.kinds()).toHaveLength(3);
      h.settle(true);
      h.scheduler.pushed(true);
      h.at(40 * MIN);
      expect(h.kinds()).toHaveLength(4);
    } finally {
      h.cleanup();
    }
  });

  it("applies push backoff after a notes-sync push failure", () => {
    const h = harness((due) => (due ? "brain-push" : null));
    try {
      h.at(0);
      h.settle(true);
      h.scheduler.pushed(true);
      h.at(MIN);
      h.scheduler.notesSynced({ committed: true, pushed: false });
      h.at(2 * MIN);
      h.scheduler.notesSynced({ committed: true, pushed: false });
      h.at(21 * MIN);
      expect(h.kinds()).toEqual(["brain-push"]);
      h.at(22 * MIN);
      expect(h.kinds()).toEqual(["brain-push", "brain-push"]);
    } finally {
      h.cleanup();
    }
  });

  it("delays autosave only after a failed commit, not after a failed push", () => {
    const h = harness(() => "notes-sync");
    try {
      h.at(0);
      h.settle(false);
      h.scheduler.notesSynced({ committed: true, pushed: false });
      h.at(MIN);
      expect(h.kinds()).toEqual(["notes-sync", "notes-sync"]);
      h.settle(false);
      h.scheduler.notesSynced({ committed: false, pushed: false });
      h.at(2 * MIN);
      h.at(10 * MIN);
      expect(h.kinds()).toHaveLength(2);
      h.at(11 * MIN);
      expect(h.kinds()).toHaveLength(3);
    } finally {
      h.cleanup();
    }
  });

  it("at startup fails every running job and recovers its interrupted run", () => {
    const brain = makeGitBrain({});
    const db = openTestDb();
    const quarantineRoot = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
    try {
      const id = enqueueJob(db, "research", { topic: "glossary" }, null).id;
      claimNextJob(db);
      heartbeat(db, id); // fresh: a stale-only check would miss it
      writeRunMarker(quarantineRoot, id, snapshotRun(brain.root));
      writeFileSync(join(brain.root, "partial.md"), "# partial\n");
      makeScheduler({ db, root: brain.root, quarantineRoot, clock: () => 0 }).startup();
      expect(getJob(db, id)?.status).toBe("failed");
      expect(pendingRecovery(quarantineRoot)).toEqual([]);
      expect(brain.git("status", "--porcelain")).toBe("");
      const texts = eventsSince(db, id, 0).map((e) => e.text);
      expect(texts.some((t) => /moved to quarantine/.test(t))).toBe(true);
    } finally {
      brain.cleanup();
      rmSync(quarantineRoot, { recursive: true, force: true });
    }
  });

  it("retries a failed recovery every 10 minutes and reports it on the job", () => {
    const db = openTestDb();
    const quarantineRoot = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let now = 0;
    const recover = vi.fn(
      (): RecoveryResult => ({
        recovered: [],
        failed: [{ jobId: "1", error: "boom" }],
        corrupt: [],
      }),
    );
    try {
      const id = enqueueJob(db, "research", { topic: "glossary" }, null).id;
      const brain = makeGitBrain({});
      writeRunMarker(quarantineRoot, id, snapshotRun(brain.root));
      brain.cleanup();
      const scheduler = makeScheduler({
        db,
        root: "/x",
        quarantineRoot,
        clock: () => now,
        recover,
      });
      scheduler.startup();
      expect(recover).toHaveBeenCalledTimes(1);
      now = 9 * MIN;
      scheduler.tick();
      expect(recover).toHaveBeenCalledTimes(1);
      now = 10 * MIN;
      scheduler.tick();
      expect(recover).toHaveBeenCalledTimes(2);
      const failures = eventsSince(db, id, 0).filter((e) => e.kind === "error");
      expect(failures.map((e) => e.text)).toEqual([
        expect.stringMatching(/Recovery failed.*boom/),
        expect.stringMatching(/Recovery failed.*boom/),
      ]);
      expect(db.select().from(jobs).where(eq(jobs.kind, "notes-sync")).all()).toEqual([]);
    } finally {
      errors.mockRestore();
      rmSync(quarantineRoot, { recursive: true, force: true });
    }
  });
});
