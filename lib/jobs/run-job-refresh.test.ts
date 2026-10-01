import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentRuns } from "@/lib/db/schema";
import { runOne, setup } from "@/tests/helpers/run-job";

const OLD = "---\ntitle: Glossary\nresearched: 2026-01-10\n---\n# Glossary\n\nOld text.\n";

describe("runAgentJob: research refresh", () => {
  it("rewrites the existing document, commits it and records the refresh prompt version", async () => {
    const { brain, db, deps } = setup(
      "success",
      { "research/glossary.md": OLD },
      { today: "2026-10-04" },
    );
    try {
      const job = await runOne(deps, "research", {
        topic: "glossary",
        mode: "refresh",
        month: "2026-10",
      });
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s")).toMatch(/^agent\(research\): Glossary/);
      expect(readFileSync(join(brain.root, "research/glossary.md"), "utf8")).toContain(
        "researched: 2026-10-04",
      );
      expect(db.select().from(agentRuns).get()).toMatchObject({
        promptVersion: "5-v1",
        filesChanged: ["research/glossary.md"],
      });
    } finally {
      brain.cleanup();
    }
  });

  it("fails before the CLI starts when the document does not exist", async () => {
    const { brain, db, deps } = setup("success");
    try {
      const job = await runOne(deps, "research", { topic: "glossary", mode: "refresh" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/^Missing research\/glossary\.md — run the research sprint/);
      expect(db.select().from(agentRuns).all()).toEqual([]);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("fails a malformed refresh month without running", async () => {
    const { brain, db, deps } = setup("success", { "research/glossary.md": OLD });
    try {
      const job = await runOne(deps, "research", {
        topic: "glossary",
        mode: "refresh",
        month: "2026-10-01",
      });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/invalid research params/i);
      expect(db.select().from(agentRuns).all()).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });
});
