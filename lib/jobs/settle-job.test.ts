import { connectionOf } from "@/lib/db/client";
import { openTestDb } from "@/tests/helpers/db";
import { claimNextJob, deferJob, enqueueJob, eventsSince, finishJob, getJob } from "./queue";
import { LEFT_RUNNING, runAndSettle } from "./settle-job";

const t0 = new Date("2026-10-01T00:00:00Z");
const now = () => t0;

function claimed() {
  const db = openTestDb();
  enqueueJob(db, "scan", { productId: "example" }, null, t0);
  const job = claimNextJob(db, t0);
  if (!job) throw new Error("expected a claimed job");
  return { db, job };
}

describe("runAndSettle", () => {
  it("fails a job its runner left running, with a plain message", async () => {
    const { db, job } = claimed();
    await runAndSettle(db, job, async () => {}, now);
    expect(getJob(db, job.id)).toMatchObject({ status: "failed", error: LEFT_RUNNING });
    expect(eventsSince(db, job.id, 0).map((e) => e.text)).toEqual([LEFT_RUNNING]);
  });

  it("leaves a job the runner finished or deferred alone", async () => {
    const { db, job } = claimed();
    await runAndSettle(db, job, async () => void finishJob(db, job.id, "ok", null, t0), now);
    expect(getJob(db, job.id)).toMatchObject({ status: "ok", error: null });

    const second = claimed();
    const until = new Date(t0.getTime() + 60_000);
    await runAndSettle(
      second.db,
      second.job,
      async () => void deferJob(second.db, second.job.id, until),
      now,
    );
    expect(getJob(second.db, second.job.id)?.status).toBe("queued");
  });

  it("never throws when the job cannot be read or written", async () => {
    const { db, job } = claimed();
    connectionOf(db).close(); // the database itself is what failed
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(runAndSettle(db, job, async () => {}, now)).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
