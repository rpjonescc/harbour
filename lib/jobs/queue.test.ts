import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrateDb, openDb } from "@/lib/db/client";
import { openTestDb } from "@/tests/helpers/db";
import {
  addEvent,
  claimNextJob,
  enqueueJob,
  eventsSince,
  finishJob,
  getJob,
  heartbeat,
  isCancelRequested,
  listJobs,
  MAX_EVENTS,
  recoverRunningJobs,
  recoverStaleJobs,
  requestCancel,
} from "./queue";

const t0 = new Date("2026-10-01T00:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("job queue", () => {
  it("dedupes identical active requests but allows new ones after finishing", () => {
    const db = openTestDb();
    const a = enqueueJob(db, "research", { topic: "glossary" }, "owner@example.com", t0);
    const b = enqueueJob(db, "research", { topic: "glossary" }, "owner@example.com", t0);
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    const claimed = claimNextJob(db, t0);
    if (!claimed) throw new Error("expected a claimed job");
    finishJob(db, claimed.id, "ok", null, at(1));
    expect(enqueueJob(db, "research", { topic: "glossary" }, null, at(2)).created).toBe(true);
  });

  it("claims oldest first, exactly once", () => {
    const db = openTestDb();
    const first = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    enqueueJob(db, "research", { topic: "b" }, null, at(1));
    const job = claimNextJob(db, at(2));
    expect(job?.id).toBe(first);
    expect(job?.status).toBe("running");
    expect(job?.startedAt).toEqual(at(2));
    expect(claimNextJob(db, at(3))?.id).not.toBe(first);
    expect(claimNextJob(db, at(4))).toBeNull();
  });

  it("cancels queued jobs immediately and flags running ones", () => {
    const db = openTestDb();
    const queued = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    expect(requestCancel(db, queued, at(1))).toBe("cancelled");
    expect(getJob(db, queued)?.status).toBe("cancelled");
    const running = enqueueJob(db, "research", { topic: "b" }, null, t0).id;
    claimNextJob(db, at(1));
    expect(requestCancel(db, running, at(2))).toBe("requested");
    expect(isCancelRequested(db, running)).toBe(true);
    finishJob(db, running, "cancelled", null, at(3));
    expect(requestCancel(db, running, at(4))).toBe("not-active");
  });

  it("fails running jobs whose heartbeat went stale", () => {
    const db = openTestDb();
    const id = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    claimNextJob(db, t0);
    heartbeat(db, id, at(10_000));
    expect(recoverStaleJobs(db, at(30_000))).toBe(0);
    expect(recoverStaleJobs(db, at(80_000))).toBe(1);
    expect(getJob(db, id)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/worker stopped/i),
    });
  });

  it("recovers every running job at worker start, even with a fresh heartbeat", () => {
    const db = openTestDb();
    const agent = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    const sync = enqueueJob(db, "notes-sync", {}, null, t0).id;
    const queued = enqueueJob(db, "research", { topic: "b" }, null, t0).id;
    claimNextJob(db, t0);
    claimNextJob(db, t0);
    heartbeat(db, agent, at(1000));
    expect(recoverRunningJobs(db, at(1001))).toEqual([agent, sync]);
    expect(getJob(db, agent)).toMatchObject({
      status: "failed",
      error: "Worker stopped during run — partial changes moved to quarantine",
    });
    expect(getJob(db, sync)).toMatchObject({ status: "failed", error: "Worker stopped" });
    expect(getJob(db, queued)?.status).toBe("queued");
    expect(recoverRunningJobs(db, at(2000))).toEqual([]);
  });

  it("caps events per job with one final note", () => {
    const db = openTestDb();
    const id = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    for (let i = 0; i < MAX_EVENTS + 20; i++) addEvent(db, id, "tool", `e${i}`, t0);
    const events = eventsSince(db, id, 0);
    expect(events).toHaveLength(MAX_EVENTS + 1);
    expect(events.at(-1)?.text).toMatch(/limit/i);
    const tenth = events[9];
    if (!tenth) throw new Error("expected at least ten events");
    expect(eventsSince(db, id, tenth.id)).toHaveLength(MAX_EVENTS + 1 - 10);
  });

  it("lists newest first", () => {
    const db = openTestDb();
    enqueueJob(db, "research", { topic: "a" }, null, t0);
    const newer = enqueueJob(db, "research", { topic: "b" }, null, at(1)).id;
    expect(listJobs(db)[0]?.id).toBe(newer);
  });
});

describe("job queue transitions", () => {
  it("finishJob only applies to running jobs", () => {
    const db = openTestDb();
    const id = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    expect(finishJob(db, id, "ok", null, at(1))).toBe(false);
    claimNextJob(db, t0);
    requestCancel(db, id, at(1));
    expect(finishJob(db, id, "cancelled", null, at(2))).toBe(true);
    expect(finishJob(db, id, "ok", null, at(3))).toBe(false);
    expect(getJob(db, id)?.status).toBe("cancelled");
    const failed = enqueueJob(db, "research", { topic: "b" }, null, t0).id;
    claimNextJob(db, t0);
    recoverStaleJobs(db, at(120_000));
    expect(finishJob(db, failed, "ok", null, at(130_000))).toBe(false);
    expect(getJob(db, failed)?.status).toBe("failed");
  });

  it("dedupes regardless of param order", () => {
    const db = openTestDb();
    const a = enqueueJob(db, "research", { x: "1", y: "2" }, null, t0);
    const b = enqueueJob(db, "research", { y: "2", x: "1" }, null, t0);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it("treats a running job with no heartbeat as stale", () => {
    const db = openTestDb();
    const id = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    claimNextJob(db, t0);
    db.run(sql`UPDATE jobs SET heartbeat_at = NULL WHERE id = ${id}`);
    expect(recoverStaleJobs(db, at(1))).toBe(1);
  });

  it("stays consistent across two connections to one file", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-queue-"));
    try {
      const a = openDb(join(dir, "t.db"));
      migrateDb(a);
      const b = openDb(join(dir, "t.db"));
      const first = enqueueJob(a, "research", { topic: "a" }, null, t0);
      expect(enqueueJob(b, "research", { topic: "a" }, null, t0)).toEqual({
        id: first.id,
        created: false,
      });
      expect(claimNextJob(b, t0)?.id).toBe(first.id);
      expect(enqueueJob(a, "research", { topic: "z" }, null, t0).created).toBe(true);
      expect(claimNextJob(a, t0)?.id).not.toBe(first.id);
      expect(requestCancel(b, first.id, t0)).toBe("requested");
      expect(finishJob(a, first.id, "cancelled", null, t0)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
