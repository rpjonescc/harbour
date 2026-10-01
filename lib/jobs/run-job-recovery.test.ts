import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { snapshotRun } from "@/lib/agents/brain-git";
import { runProcess } from "@/lib/agents/process";
import { jobs } from "@/lib/db/schema";
import { claim, reload, runOne, setup } from "@/tests/helpers/run-job";
import { runNotesSyncJob } from "./git-jobs";
import { enqueueJob, eventsSince, requestCancel } from "./queue";
import { runAgentJob } from "./run-job";
import { pendingRecovery, writeRunMarker } from "./run-marker";

const commits = (git: (...args: string[]) => string) => git("rev-list", "--count", "HEAD").trim();

describe("runAgentJob run markers", () => {
  it("holds a durable marker while the agent runs and removes it once committed", async () => {
    const seen: string[][] = [];
    const s = setup("success");
    s.deps.run = (o) => {
      seen.push(pendingRecovery(s.deps.quarantineRoot));
      return runProcess({ ...o, pollMs: 50 });
    };
    try {
      const job = await runOne(s.deps, "research", { topic: "glossary" });
      expect(job.status).toBe("ok");
      expect(seen).toEqual([[String(job.id)]]);
      expect(pendingRecovery(s.deps.quarantineRoot)).toEqual([]);
    } finally {
      s.brain.cleanup();
    }
  });

  it("removes the marker once a failed run is discarded", async () => {
    const s = setup("escape");
    try {
      expect((await runOne(s.deps, "research", { topic: "glossary" })).status).toBe("failed");
      expect(pendingRecovery(s.deps.quarantineRoot)).toEqual([]);
    } finally {
      s.brain.cleanup();
    }
  });

  it("refuses agent runs and autosave while a previous run awaits recovery", async () => {
    const s = setup("success");
    try {
      writeRunMarker(s.deps.quarantineRoot, 99, snapshotRun(s.brain.root));
      writeFileSync(join(s.brain.root, "draft.md"), "# draft\n");
      const job = await runOne(s.deps, "research", { topic: "glossary" });
      expect(job).toMatchObject({
        status: "failed",
        error: expect.stringMatching(/still being recovered/),
      });
      enqueueJob(s.db, "notes-sync", {}, null);
      const sync = claim(s.deps);
      expect(runNotesSyncJob(s.deps, sync)).toEqual({ committed: false, pushed: false });
      expect(reload(s.deps, sync.id).error).toMatch(/still being recovered/);
      expect(commits(s.brain.git)).toBe("1");
    } finally {
      s.brain.cleanup();
    }
  });

  it("fails and restores .git/config when the agent tampers with git metadata", async () => {
    const s = setup("tamper-git");
    try {
      const config = readFileSync(join(s.brain.root, ".git/config"));
      const job = await runOne(s.deps, "research", { topic: "glossary" });
      expect(job).toMatchObject({ status: "failed", error: expect.stringMatching(/git metadata/) });
      expect(commits(s.brain.git)).toBe("1");
      expect(readFileSync(join(s.brain.root, ".git/config"))).toEqual(config);
      expect(s.brain.git("status", "--porcelain")).toBe("");
    } finally {
      s.brain.cleanup();
    }
  });

  it("rejects an oversized proposals file without reading it", async () => {
    const s = setup("success", { "products/acme-docs/notes.md": "# Notes\n" });
    s.deps.run = async (o) => {
      const outcome = await runProcess({ ...o, pollMs: 50 });
      writeFileSync(join(o.cwd, "products/acme-docs/proposals.json"), " ".repeat(1024 * 1024 + 1));
      return outcome;
    };
    try {
      const job = await runOne(s.deps, "discovery", { productId: "acme-docs" });
      expect(job).toMatchObject({ status: "failed", error: expect.stringMatching(/too large/) });
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("runAgentJob stopping", () => {
  it("cancels and discards when the worker is stopping", async () => {
    const s = setup("slow", {}, { stopping: () => true });
    try {
      expect((await runOne(s.deps, "research", { topic: "glossary" })).status).toBe("cancelled");
      expect(s.brain.git("status", "--porcelain")).toBe("");
      expect(pendingRecovery(s.deps.quarantineRoot)).toEqual([]);
    } finally {
      s.brain.cleanup();
    }
  });

  it("still finishes as cancelled, keeping the marker, when the discard fails", async () => {
    const s = setup("slow");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    s.deps.run = (o) => {
      writeFileSync(join(o.cwd, "partial.md"), "# partial\n");
      chmodSync(s.deps.quarantineRoot, 0o500); // no quarantine folder can be created
      return runProcess({ ...o, env: { ...o.env, FAKE_CLAUDE_SCENARIO: "slow" }, pollMs: 50 });
    };
    try {
      enqueueJob(s.db, "research", { topic: "glossary" }, null);
      const job = claim(s.deps);
      setTimeout(() => requestCancel(s.db, job.id), 150);
      await runAgentJob(s.deps, job);
      expect(reload(s.deps, job.id).status).toBe("cancelled");
      const errorsLogged = eventsSince(s.db, job.id, 0).filter((e) => e.kind === "error");
      expect(errorsLogged.some((e) => /could not discard/i.test(e.text))).toBe(true);
      expect(pendingRecovery(s.deps.quarantineRoot)).toEqual([String(job.id)]);
    } finally {
      chmodSync(s.deps.quarantineRoot, 0o700);
      errors.mockRestore();
      s.brain.cleanup();
    }
  });

  it("warns when the job was already finished elsewhere", async () => {
    const s = setup("success");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    s.deps.run = async (o) => {
      const outcome = await runProcess({ ...o, pollMs: 50 });
      s.db.update(jobs).set({ status: "failed" }).where(eq(jobs.status, "running")).run();
      return outcome;
    };
    try {
      mkdirSync(s.deps.quarantineRoot, { recursive: true });
      await runOne(s.deps, "research", { topic: "glossary" });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no longer running/));
    } finally {
      warn.mockRestore();
      s.brain.cleanup();
    }
  });
});
