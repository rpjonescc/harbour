import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertBrainRepoRoot, snapshotRun } from "@/lib/agents/brain-git";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { claim, reload, runOne, setup } from "@/tests/helpers/run-job";
import { runNotesSyncJob, runPushJob } from "./git-jobs";
import { housekeepingAction } from "./housekeeping";
import { enqueueJob } from "./queue";
import { pendingRecovery, recoverRuns, writeRunMarker } from "./run-marker";

const NOT_OWN_ROOT = /root of its own git repository/;

/** A brain folder that is a subfolder of another (parent) repository, with pending parent work. */
function nestedBrain() {
  const s = setup("success", { "brain/notes.md": "# Notes\n" });
  const parent = s.brain;
  s.deps.root = join(parent.root, "brain");
  // An uncommitted owner edit inside the folder, and an unpushed commit in the parent.
  writeFileSync(join(parent.root, "brain/draft.md"), "# draft\n");
  const old = new Date(Date.now() - 60 * 60_000);
  utimesSync(join(parent.root, "brain/draft.md"), old, old);
  writeFileSync(join(parent.root, "local.md"), "# local\n");
  parent.git("add", "local.md");
  parent.git("commit", "-q", "-m", "local");
  const state = () => ({
    head: parent.git("rev-parse", "HEAD").trim(),
    unpushed: parent.git("rev-list", "--count", "@{upstream}..HEAD").trim(),
    status: parent.git("status", "--porcelain"),
  });
  return { ...s, parent, state };
}

describe("brain repository root guard", () => {
  it("assertBrainRepoRoot names the enclosing repository, or a missing repository", () => {
    const n = nestedBrain();
    const plain = mkdtempSync(join(tmpdir(), "harbour-plain-"));
    try {
      expect(() => assertBrainRepoRoot(n.parent.root)).not.toThrow();
      expect(() => assertBrainRepoRoot(n.deps.root)).toThrow(NOT_OWN_ROOT);
      expect(() => assertBrainRepoRoot(n.deps.root)).toThrow(/it is inside /);
      expect(() => assertBrainRepoRoot(plain)).toThrow(NOT_OWN_ROOT);
    } finally {
      n.parent.cleanup();
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("every entry point refuses a subfolder of another repository, leaving it untouched", async () => {
    const n = nestedBrain();
    try {
      const before = n.state();
      const job = await runOne(n.deps, "research", { topic: "glossary" });
      expect(job).toMatchObject({ status: "failed", error: expect.stringMatching(NOT_OWN_ROOT) });

      enqueueJob(n.db, "notes-sync", {}, null);
      const sync = claim(n.deps);
      expect(runNotesSyncJob(n.deps, sync)).toEqual({ committed: false, pushed: false });
      expect(reload(n.deps, sync.id).error).toMatch(NOT_OWN_ROOT);

      enqueueJob(n.db, "brain-push", {}, null);
      const push = claim(n.deps);
      expect(runPushJob(n.deps, push)).toBe(false);
      expect(reload(n.deps, push.id).error).toMatch(NOT_OWN_ROOT);

      const opts = { quietMs: 0, pushRetryDue: true, quarantineRoot: n.deps.quarantineRoot };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(housekeepingAction(n.deps.root, new Date(), opts)).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(NOT_OWN_ROOT));
      warn.mockRestore();

      const clean = makeGitBrain({});
      writeRunMarker(n.deps.quarantineRoot, 42, snapshotRun(clean.root));
      clean.cleanup();
      const recovery = recoverRuns(n.deps.root, n.deps.quarantineRoot);
      expect(recovery.failed).toEqual([
        { jobId: "42", error: expect.stringMatching(NOT_OWN_ROOT) },
      ]);
      expect(pendingRecovery(n.deps.quarantineRoot)).toEqual(["42"]);

      expect(n.state()).toEqual(before);
    } finally {
      n.parent.cleanup();
    }
  });

  it("refuses a folder that is not a git repository at all", async () => {
    const s = setup("success");
    const plain = mkdtempSync(join(tmpdir(), "harbour-plain-"));
    s.deps.root = plain;
    try {
      writeFileSync(join(plain, "draft.md"), "# draft\n");
      const job = await runOne(s.deps, "research", { topic: "glossary" });
      expect(job.error).toMatch(NOT_OWN_ROOT);
      enqueueJob(s.db, "notes-sync", {}, null);
      expect(runNotesSyncJob(s.deps, claim(s.deps)).committed).toBe(false);
    } finally {
      s.brain.cleanup();
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
