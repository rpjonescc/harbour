import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitChanges, ownerChanges, pushBrain } from "@/lib/agents/brain-git";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { runOne, setup } from "@/tests/helpers/run-job";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

/** A brain repository nested inside a parent repository that has an unpushed commit. */
function nested(parent = makeGitBrain({})) {
  const root = join(parent.root, "brain");
  mkdirSync(root);
  writeFileSync(join(root, "README.md"), "# Nested brain\n");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test Owner");
  git(root, "config", "user.email", "owner@example.com");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  writeFileSync(join(parent.root, "local.md"), "# local\n");
  parent.git("add", "local.md");
  parent.git("commit", "-q", "-m", "local");
  const parentState = () => ({
    head: parent.git("rev-parse", "HEAD").trim(),
    log: parent.git("log", "--format=%s"),
    unpushed: parent.git("rev-list", "--count", "@{upstream}..HEAD").trim(),
    status: parent.git("status", "--porcelain"),
  });
  return { parent, root, parentState };
}

describe("git pinned to the brain repository", () => {
  it("never falls through to an enclosing repository when the brain's .git is broken", () => {
    const n = nested();
    try {
      const before = n.parentState();
      writeFileSync(join(n.root, ".git/HEAD"), "garbage\n");
      writeFileSync(join(n.root, "note.md"), "# note\n");
      expect(() => ownerChanges(n.root)).toThrow();
      expect(() => commitChanges(n.root, ["note.md"], "x")).toThrow();
      expect(pushBrain(n.root).ok).toBe(false);
      expect(n.parentState()).toEqual(before);
    } finally {
      n.parent.cleanup();
    }
  });

  it("a broken .git/HEAD fails the run, leaves the enclosing repo alone and is restored", async () => {
    const s = setup("tamper-head");
    const { parent, root, parentState } = nested(s.brain);
    s.deps.root = root;
    try {
      const before = parentState();
      const brainHead = git(root, "rev-parse", "HEAD").trim();
      const job = await runOne(s.deps, "research", { topic: "glossary" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/git metadata/);
      expect(parentState()).toEqual(before);
      expect(git(root, "rev-parse", "HEAD").trim()).toBe(brainHead);
      expect(git(root, "status", "--porcelain")).toBe("");
      expect(git(root, "log", "--format=%s").trim()).toBe("init");
    } finally {
      parent.cleanup();
    }
  });
});
