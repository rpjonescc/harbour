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
