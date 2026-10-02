import { claimNextJob, enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { waitsForOtherChain } from "./chain-wait";

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
