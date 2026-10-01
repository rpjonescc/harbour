import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { actions, agentRuns } from "@/lib/db/schema";
import { runOne, setup } from "@/tests/helpers/run-job";
import { retryPendingImports } from "./import-retry";
import { eventsSince } from "./queue";

describe("runAgentJob for the weekly analyst", () => {
  const WEEK = { week: "2026-W40" };
  const REPORT = "reports/weekly/2026-W40.md";
  const PROPOSALS = "reports/weekly/2026-W40.proposals.json";

  it("commits the report and proposals, then imports the suggested action", async () => {
    const { brain, db, deps } = setup("success");
    const prompts: string[] = [];
    const run = deps.run;
    deps.run = (o) => {
      prompts.push(o.args[o.args.indexOf("-p") + 1] ?? "");
      return run(o);
    };
    try {
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s").trim()).toBe("agent(weekly-analyst): 2026-W40");
      expect(
        brain.git("show", "--name-only", "--format=", "HEAD").trim().split("\n").sort(),
      ).toEqual([REPORT, PROPOSALS]);
      expect(db.select().from(agentRuns).get()).toMatchObject({ promptVersion: "4-v1" });
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toEqual(
        expect.arrayContaining(["Committed 2 file(s)", "Imported 1 action(s); 0 already known"]),
      );
      expect(db.select().from(actions).all()).toMatchObject([
        { status: "suggested", source: "agent", sourceJobId: job.id, productId: "acme-docs" },
      ]);
      expect(prompts[0]).toContain('"week":"2026-W40"');
      expect(prompts[0]).toContain('"timeZone":"Europe/London"');
    } finally {
      brain.cleanup();
    }
  });

  it("fails, imports nothing and quarantines both files when the proposals are invalid", async () => {
    const { brain, db, deps } = setup("bad-weekly");
    try {
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/Unknown product: ghost-product/);
      expect(db.select().from(actions).all()).toEqual([]);
      const quarantine = join(deps.quarantineRoot, `job-${job.id}`);
      expect(existsSync(join(quarantine, REPORT))).toBe(true);
      expect(existsSync(join(quarantine, PROPOSALS))).toBe(true);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("fails and commits nothing when the report is missing", async () => {
    const { brain, db, deps } = setup("no-report");
    try {
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job).toMatchObject({ status: "failed", error: `Agent did not write ${REPORT}` });
      expect(db.select().from(actions).all()).toEqual([]);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("fails a malformed week without running the agent", async () => {
    const { brain, deps } = setup("success");
    try {
      const job = await runOne(deps, "weekly-analyst", { week: "../../etc" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/invalid week/i);
    } finally {
      brain.cleanup();
    }
  });

  it("waits for the brain to be quiet like every agent job", async () => {
    const { brain, deps } = setup("success");
    try {
      writeFileSync(join(brain.root, "draft.md"), "# draft\n");
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job.status).toBe("queued");
      expect(existsSync(join(brain.root, REPORT))).toBe(false);
    } finally {
      brain.cleanup();
    }
  });
  it("imports nothing and quarantines both files when the commit fails", async () => {
    const { brain, db, deps } = setup("success");
    const lock = join(brain.root, ".git/refs/heads/main.lock");
    const run = deps.run;
    deps.run = async (o) => {
      const outcome = await run(o);
      writeFileSync(lock, ""); // git cannot move the branch: the commit fails
      return outcome;
    };
    try {
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/lock/);
      expect(db.select().from(actions).all()).toEqual([]);
      expect(db.select().from(agentRuns).get()?.importedAt ?? null).toBeNull();
      const quarantine = join(deps.quarantineRoot, `job-${job.id}`);
      expect(existsSync(join(quarantine, REPORT))).toBe(true);
      expect(existsSync(join(quarantine, PROPOSALS))).toBe(true);
      rmSync(lock);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("keeps the commit when the import fails after it, and a retry imports exactly once", async () => {
    const { brain, db, deps } = setup("success");
    const run = deps.run;
    deps.run = async (o) => {
      const outcome = await run(o);
      db.run(
        sql`CREATE TRIGGER no_actions BEFORE INSERT ON actions BEGIN SELECT RAISE(ABORT, 'database is busy'); END`,
      );
      return outcome;
    };
    try {
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job.status).toBe("ok");
      expect(brain.git("log", "-1", "--format=%s").trim()).toBe("agent(weekly-analyst): 2026-W40");
      expect(db.select().from(actions).all()).toEqual([]);
      expect(
        eventsSince(db, job.id, 0)
          .filter((e) => e.kind === "error")
          .map((e) => e.text),
      ).toEqual([
        "Import failed — the files are committed and the import will be retried automatically: database is busy",
      ]);
      db.run(sql`DROP TRIGGER no_actions`);
      const retry = { db, root: brain.root, products: deps.products, now: new Date() };
      expect(retryPendingImports(retry)).toBe(1);
      expect(retryPendingImports(retry)).toBe(0);
      expect(db.select().from(actions).all()).toMatchObject([{ sourceJobId: job.id }]);
      expect(eventsSince(db, job.id, 0).at(-1)?.text).toBe(
        "Imported 1 action(s); 0 already known (retried)",
      );
    } finally {
      brain.cleanup();
    }
  });

  it("keeps the run ok when counting the import attempt fails after the commit", async () => {
    const { brain, db, deps } = setup("success");
    const run = deps.run;
    deps.run = async (o) => {
      const outcome = await run(o);
      db.run(
        sql`CREATE TRIGGER no_count BEFORE UPDATE OF import_attempts ON agent_runs BEGIN SELECT RAISE(ABORT, 'database is busy'); END`,
      );
      return outcome;
    };
    try {
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s").trim()).toBe("agent(weekly-analyst): 2026-W40");
      expect(eventsSince(db, job.id, 0).filter((e) => e.kind === "error")).toMatchObject([
        { text: expect.stringMatching(/^Import failed .*database is busy$/) },
      ]);
      expect(db.select().from(agentRuns).get()).toMatchObject({ importedAt: null });
    } finally {
      brain.cleanup();
    }
  });

  it("does not build the export while the job waits for a quiet brain", async () => {
    const { brain, db, deps } = setup("success");
    try {
      writeFileSync(join(brain.root, "draft.md"), "# draft\n");
      db.run(sql`ALTER TABLE scores RENAME TO scores_unreadable`); // building the export would throw
      const job = await runOne(deps, "weekly-analyst", WEEK);
      expect(job).toMatchObject({ status: "queued", error: null });
    } finally {
      brain.cleanup();
    }
  });
});
