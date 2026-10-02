import { eq } from "drizzle-orm";
import { jobs as jobsTable } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, eventsSince, getJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import {
  deferForOtherChain,
  GAVE_UP_NOTE,
  MAX_WAIT_MS,
  WAITING_NOTE,
  waitsForOtherChain,
} from "./chain-wait";

describe("waitsForOtherChain", () => {
  it("makes a second idea's draft wait while another idea has a queued or running chain job", () => {
    const db = openTestDb();
    enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    const b = enqueueJob(db, "content-draft", { ideaId: "b-1" }, "me");
    const first = claimNextJob(db);
    enqueueJob(db, "content-atomise", { ideaId: "a-1" }, null); // the chain's next step, queued behind b
    const second = claimNextJob(db);
    expect(first?.params.ideaId).toBe("a-1");
    expect(second?.id).toBe(b.id);
    expect(second && waitsForOtherChain(db, second)).toBe(true);
  });

  it("does not wait for its own idea, or when nothing else is under way", () => {
    const db = openTestDb();
    const only = enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    const job = claimNextJob(db);
    expect(job?.id).toBe(only.id);
    expect(job && waitsForOtherChain(db, job)).toBe(false);
  });

  it("does not wait for its own idea's later steps, nor for finished or unrelated jobs", () => {
    const db = openTestDb();
    const a = enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    enqueueJob(db, "content-atomise", { ideaId: "a-1" }, null);
    enqueueJob(db, "content-ideas", { productId: "acme-docs" }, "me");
    const job = claimNextJob(db);
    expect(job?.id).toBe(a.id);
    expect(job && waitsForOtherChain(db, job)).toBe(false);
  });

  it("lets the oldest of several queued drafts for different ideas go first, so none waits forever", () => {
    const db = openTestDb();
    const a = enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    const b = enqueueJob(db, "content-draft", { ideaId: "b-1" }, "me");
    expect(
      waitsForOtherChain(db, { id: a.id, kind: "content-draft", params: { ideaId: "a-1" } }),
    ).toBe(false);
    expect(
      waitsForOtherChain(db, { id: b.id, kind: "content-draft", params: { ideaId: "b-1" } }),
    ).toBe(true);
  });

  it("is only for drafts, and an unknown job never lets two chains overlap", () => {
    const db = openTestDb();
    const a = enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    expect(waitsForOtherChain(db, { id: 999, kind: "content-ideas", params: {} })).toBe(false);
    expect(waitsForOtherChain(db, { id: 999, kind: "content-draft", params: {} })).toBe(true);
    expect(a.id).toBeGreaterThan(0);
  });
});

describe("deferForOtherChain", () => {
  const T0 = new Date("2026-10-02T10:00:00Z");
  /** Idea a-1 has a running draft; idea b-1's draft is claimed (running) and must wait. */
  function blocked() {
    const db = openTestDb();
    enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    claimNextJob(db);
    const queued = enqueueJob(db, "content-draft", { ideaId: "b-1" }, "me");
    const job = claimNextJob(db, new Date(Date.now() + 1000));
    if (!job || job.id !== queued.id) throw new Error("expected b-1 to be claimed");
    return { db, job };
  }

  it("runs a job that has nothing to wait for, and ignores other kinds", () => {
    const db = openTestDb();
    enqueueJob(db, "content-draft", { ideaId: "a-1" }, "me");
    const job = claimNextJob(db);
    expect(job && deferForOtherChain(db, job, T0)).toBe(false);
    enqueueJob(db, "content-ideas", { productId: "p" }, "me");
    const other = claimNextJob(db);
    expect(other && deferForOtherChain(db, other, T0)).toBe(false);
  });

  it("puts the job back with one plain status note, then backs off from 30 seconds to 5 minutes", () => {
    const { db, job } = blocked();
    const wait = (at: Date) => {
      const claimed = getJob(db, job.id);
      if (!claimed) throw new Error("job gone");
      db.update(jobsTable).set({ status: "running" }).where(eq(jobsTable.id, job.id)).run();
      expect(deferForOtherChain(db, { ...claimed, createdAt: T0 }, at)).toBe(true);
      return (getJob(db, job.id)?.notBefore?.getTime() ?? 0) - at.getTime();
    };
    expect(wait(T0)).toBe(30_000);
    expect(wait(new Date(T0.getTime() + 10 * 60_000))).toBe(5 * 60_000);
    expect(wait(new Date(T0.getTime() + 5 * 60 * 60_000))).toBe(5 * 60_000);
    const notes = eventsSince(db, job.id, 0).map((e) => e.text);
    expect(notes).toEqual([WAITING_NOTE]);
    expect(getJob(db, job.id)?.status).toBe("queued");
  });

  it("fails the job in fixed words after six hours of waiting", () => {
    const { db, job } = blocked();
    const at = new Date(T0.getTime() + MAX_WAIT_MS);
    expect(deferForOtherChain(db, { ...job, createdAt: T0 }, at)).toBe(true);
    expect(getJob(db, job.id)).toMatchObject({ status: "failed", error: GAVE_UP_NOTE });
    expect(eventsSince(db, job.id, 0).map((e) => e.text)).toEqual([GAVE_UP_NOTE]);
    expect(GAVE_UP_NOTE).not.toMatch(/a-1|b-1|job/i);
  });
});
