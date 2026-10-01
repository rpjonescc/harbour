import { sql } from "drizzle-orm";
import { actions, agentRuns } from "@/lib/db/schema";
import { runOne, setup } from "@/tests/helpers/run-job";
import { makeImportRetry, retryPendingImports } from "./import-retry";
import { eventsSince, MAX_IMPORT_ATTEMPTS } from "./queue";

const BLOCK = sql`CREATE TRIGGER no_actions BEFORE INSERT ON actions BEGIN SELECT RAISE(ABORT, 'blocked'); END`;

/** A weekly run whose files were committed but whose import failed. */
async function committedNotImported() {
  const s = setup("success");
  const run = s.deps.run;
  s.deps.run = async (o) => {
    const outcome = await run(o);
    s.db.run(BLOCK);
    return outcome;
  };
  const job = await runOne(s.deps, "weekly-analyst", { week: "2026-W40" });
  const retry = { db: s.db, root: s.brain.root, products: s.deps.products, now: new Date() };
  return { ...s, job, retry };
}

describe("retryPendingImports", () => {
  it("re-imports from the committed file, not the working tree", async () => {
    const { brain, db, job, retry } = await committedNotImported();
    try {
      db.run(sql`DROP TRIGGER no_actions`);
      // An owner edit after the commit must not be what gets imported.
      brain.git("rm", "-q", "reports/weekly/2026-W40.proposals.json");
      expect(retryPendingImports(retry)).toBe(1);
      expect(db.select().from(actions).all()).toMatchObject([{ sourceJobId: job.id }]);
    } finally {
      brain.cleanup();
    }
  });

  it("gives up after a bounded number of attempts, saying so", async () => {
    const { brain, db, job, retry } = await committedNotImported();
    try {
      for (let i = 1; i < MAX_IMPORT_ATTEMPTS; i++) expect(retryPendingImports(retry)).toBe(0);
      expect(db.select().from(agentRuns).get()?.importAttempts).toBe(MAX_IMPORT_ATTEMPTS);
      const before = eventsSince(db, job.id, 0).length;
      db.run(sql`DROP TRIGGER no_actions`);
      expect(retryPendingImports(retry)).toBe(0);
      expect(eventsSince(db, job.id, 0)).toHaveLength(before);
      expect(eventsSince(db, job.id, 0).at(-1)?.text).toMatch(
        /^Import attempt 3 of 3 failed: blocked — giving up; run the agent again/,
      );
      expect(db.select().from(actions).all()).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("records a failure to count the attempt instead of throwing", async () => {
    const { brain, db, job, retry } = await committedNotImported();
    try {
      db.run(sql`DROP TRIGGER no_actions`);
      db.run(
        sql`CREATE TRIGGER no_count BEFORE UPDATE OF import_attempts ON agent_runs BEGIN SELECT RAISE(ABORT, 'database is busy'); END`,
      );
      expect(retryPendingImports(retry)).toBe(0);
      expect(eventsSince(db, job.id, 0).at(-1)?.text).toBe(
        "Import attempt failed: database is busy",
      );
      expect(db.select().from(actions).all()).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("leaves runs alone that were imported, never committed, or write nothing to import", async () => {
    const s = setup("success");
    try {
      await runOne(s.deps, "weekly-analyst", { week: "2026-W40" });
      await runOne(s.deps, "research", { topic: "glossary" });
      const retry = { db: s.db, root: s.brain.root, products: s.deps.products, now: new Date() };
      expect(retryPendingImports(retry)).toBe(0);
      expect(s.db.select().from(actions).all()).toHaveLength(1);
    } finally {
      s.brain.cleanup();
    }
  });
});

describe("makeImportRetry", () => {
  it("retries on its first tick, then at most once a minute", async () => {
    const { brain, db, retry } = await committedNotImported();
    try {
      db.run(sql`DROP TRIGGER no_actions`);
      let clock = 0;
      const calls: number[] = [];
      const timer = makeImportRetry({
        ...retry,
        products: () => retry.products,
        clock: () => clock,
        retry: (deps) => {
          calls.push(clock);
          return retryPendingImports(deps);
        },
      });
      timer.tick();
      clock = 59_999;
      timer.tick();
      clock = 60_000;
      timer.tick();
      expect(calls).toEqual([0, 60_000]);
      expect(db.select().from(actions).all()).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });
});
