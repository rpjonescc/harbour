import { openTestDb } from "@/tests/helpers/db";
import { claimNextJob, enqueueJob, eventsSince, getJob } from "./queue";
import { failUnknownJob } from "./unknown-job";

describe("failUnknownJob", () => {
  it("fails the job with its kind, recorded as an error event", () => {
    const db = openTestDb();
    enqueueJob(db, "retention", { day: "2026-10-02" }, null);
    const job = claimNextJob(db);
    if (!job) throw new Error("nothing queued");
    failUnknownJob(db, job);
    expect(getJob(db, job.id)).toMatchObject({
      status: "failed",
      error: "Unknown job kind: retention",
    });
    expect(eventsSince(db, job.id, 0).map((e) => [e.kind, e.text])).toEqual([
      ["error", "Unknown job kind: retention"],
    ]);
  });
});
