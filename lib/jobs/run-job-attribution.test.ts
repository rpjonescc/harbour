import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runProcess } from "@/lib/agents/process";
import { agentRuns } from "@/lib/db/schema";
import { runOne, setup } from "@/tests/helpers/run-job";
import { eventsSince } from "./queue";
import { pendingRecovery } from "./run-marker";

/** The fake agent runs while the owner edits a tracked note and starts a new one. */
function withOwnerEditing(scenario: string) {
  const s = setup(scenario, { "notes/owner.md": "# Owner\n" });
  s.deps.run = (o) => {
    writeFileSync(join(o.cwd, "notes/owner.md"), "# Owner, edited mid-run\n");
    writeFileSync(join(o.cwd, "notes/new-idea.md"), "# A new idea\n");
    return runProcess({
      ...o,
      env: { ...o.env, FAKE_CLAUDE_SCENARIO: scenario },
      pollMs: 50,
      killGraceMs: 500,
    });
  };
  return s;
}

const ownerIntact = (root: string) => {
  expect(readFileSync(join(root, "notes/owner.md"), "utf8")).toBe("# Owner, edited mid-run\n");
  expect(readFileSync(join(root, "notes/new-idea.md"), "utf8")).toBe("# A new idea\n");
};

describe("runAgentJob with the owner editing during the run", () => {
  it("commits only the agent's file and leaves the owner's changes uncommitted", async () => {
    const { brain, db, deps } = withOwnerEditing("success");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("show", "--name-only", "--format=", "HEAD").trim()).toBe(
        "research/glossary.md",
      );
      expect(db.select().from(agentRuns).get()?.filesChanged).toEqual(["research/glossary.md"]);
      ownerIntact(brain.root);
      expect(
        brain.git("status", "--porcelain", "--untracked-files=all").split("\n").sort(),
      ).toEqual(["", " M notes/owner.md", "?? notes/new-idea.md"]);
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toContain(
        "Left 2 owner change(s) in place: notes/new-idea.md, notes/owner.md",
      );
      expect(pendingRecovery(deps.quarantineRoot)).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("fails and discards only the agent's writes when it strays outside its area", async () => {
    const { brain, deps } = withOwnerEditing("escape");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.status).toBe("failed");
      expect(job.error).toBe("Agent changed files outside its area: outside.md");
      expect(existsSync(join(brain.root, "outside.md"))).toBe(false);
      expect(existsSync(join(brain.root, "research/glossary.md"))).toBe(false);
      expect(existsSync(join(deps.quarantineRoot, `job-${job.id}`, "outside.md"))).toBe(true);
      expect(existsSync(join(deps.quarantineRoot, `job-${job.id}`, "notes"))).toBe(false);
      ownerIntact(brain.root);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("fails a run whose agent tried to write outside the brain, naming the path", async () => {
    const { brain, deps } = withOwnerEditing("outside-attempt");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.status).toBe("failed");
      expect(job.error).toBe(
        "Agent changed files outside its area: <outside the brain>: /etc/harbour-denied.md",
      );
      expect(existsSync(join(brain.root, "research/glossary.md"))).toBe(false);
      ownerIntact(brain.root);
    } finally {
      brain.cleanup();
    }
  });
});
