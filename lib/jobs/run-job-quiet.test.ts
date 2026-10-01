import { existsSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claim, reload, setup } from "@/tests/helpers/run-job";
import { claimNextJob, enqueueJob, eventsSince, type Job } from "./queue";
import { runAgentJob } from "./run-job";

function claimAt(deps: { db: Parameters<typeof claimNextJob>[0] }, ms: number): Job {
  const job = claimNextJob(deps.db, new Date(ms));
  if (!job) throw new Error("expected a due job");
  return job;
}

const QUIET_MS = 3 * 60_000;
const WAITING = "Waiting for the brain to be quiet (changes in the last 3 minutes)";

describe("runAgentJob while the owner is editing", () => {
  it("puts the job back in the queue until the brain has been quiet for 3 minutes", async () => {
    const editedAt = new Date("2026-10-01T12:00:00Z");
    let clock = editedAt.getTime() + 60_000;
    const { brain, db, deps } = setup("success", {}, { now: () => new Date(clock) });
    try {
      writeFileSync(join(brain.root, "draft.md"), "# draft\n");
      utimesSync(join(brain.root, "draft.md"), editedAt, editedAt);
      enqueueJob(db, "research", { topic: "glossary" }, null);
      const job = claimAt(deps, clock);
      expect(await runAgentJob(deps, job)).toEqual({ pushed: null });
      expect(reload(deps, job.id)).toMatchObject({
        status: "queued",
        notBefore: new Date(editedAt.getTime() + QUIET_MS),
      });
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toEqual([WAITING]);
      expect(brain.git("status", "--porcelain")).toContain("draft.md");
      expect(existsSync(join(brain.root, "research/glossary.md"))).toBe(false);

      clock = editedAt.getTime() + QUIET_MS;
      expect(claimNextJob(db, new Date(clock - 1))).toBeNull();
      const again = claimAt(deps, clock);
      expect(again.id).toBe(job.id);
      await runAgentJob(deps, again);
      expect(reload(deps, job.id).status).toBe("ok");
      expect(brain.git("log", "--format=%s", "-2")).toMatch(/notes: owner update \(1 file/);
      expect(eventsSince(db, job.id, 0).filter((e) => e.text === WAITING)).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("counts a fresh deletion as a change, dated by its folder", async () => {
    const { brain, db, deps } = setup("success", { "notes/gone.md": "# gone\n" });
    try {
      rmSync(join(brain.root, "notes/gone.md"));
      enqueueJob(db, "research", { topic: "glossary" }, null);
      const job = claim(deps);
      await runAgentJob(deps, job);
      expect(reload(deps, job.id).status).toBe("queued");
    } finally {
      brain.cleanup();
    }
  });
});
