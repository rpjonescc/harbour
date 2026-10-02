import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { ideaActivity, latestFailedStep, stepSentence } from "./chain-status";

const IDEA = "acme-docs-20261002-five-minutes";

describe("chain status", () => {
  it("reports a queued or running content job for an idea as active", () => {
    const db = openTestDb();
    enqueueJob(db, "content-atomise", { ideaId: IDEA }, null);
    expect(ideaActivity(db, [IDEA]).get(IDEA)).toEqual({ active: true, failed: null });
  });

  it("reports the newest step as failed, with its kind and params, and clears it when a later step succeeds", () => {
    const db = openTestDb();
    const failed = enqueueJob(
      db,
      "content-gate",
      { ideaId: IDEA, gate: "humanizer", attempt: "1" },
      null,
    );
    claimNextJob(db);
    finishJob(db, failed.id, "failed", "boom");
    expect(latestFailedStep(db, IDEA)).toMatchObject({
      kind: "content-gate",
      params: { gate: "humanizer", attempt: "1" },
    });
    expect(ideaActivity(db, [IDEA]).get(IDEA)?.failed?.kind).toBe("content-gate");
    const retry = enqueueJob(
      db,
      "content-gate",
      { ideaId: IDEA, gate: "humanizer", attempt: "1" },
      "me",
    );
    claimNextJob(db);
    finishJob(db, retry.id, "ok", null);
    expect(latestFailedStep(db, IDEA)).toBeNull();
  });

  it("ignores other ideas' jobs", () => {
    const db = openTestDb();
    const other = enqueueJob(db, "content-draft", { ideaId: "acme-docs-20261001-other" }, null);
    claimNextJob(db);
    finishJob(db, other.id, "failed", "boom");
    expect(latestFailedStep(db, IDEA)).toBeNull();
  });

  it("says in plain words which step did not finish", () => {
    expect(stepSentence("content-draft", {})).toBe("The draft didn't finish. Try again.");
    expect(stepSentence("content-atomise", {})).toBe(
      "The platform pieces didn't finish. Try again.",
    );
    expect(stepSentence("content-gate", { gate: "humanizer" })).toBe(
      "The humanizer check didn't finish. Try again.",
    );
    expect(stepSentence("content-gate", { gate: "facts" })).toBe(
      "The facts check didn't finish. Try again.",
    );
    expect(stepSentence("content-gate", { gate: "no-ai-slop" })).not.toMatch(/no-ai-slop/);
  });
});
