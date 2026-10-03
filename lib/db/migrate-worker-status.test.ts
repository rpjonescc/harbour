import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrateDb, openDb } from "./client";
import { jobs, workerStatus } from "./schema";

describe("the worker_status migration", () => {
  it("adds an empty heartbeat table to a database with rows, leaving them untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-mig-"));
    try {
      // A copy of the migrations folder without 0015: the schema before the heartbeat table.
      const older = join(dir, "drizzle");
      cpSync(join(process.cwd(), "drizzle"), older, { recursive: true });
      const journalFile = join(older, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
        entries: { tag: string }[];
      };
      const at = journal.entries.findIndex((entry) => entry.tag === "0015_worker_status");
      expect(at).toBeGreaterThan(0);
      journal.entries.splice(at);
      writeFileSync(journalFile, JSON.stringify(journal));

      const db = openDb(join(dir, "old.db"));
      migrate(db, { migrationsFolder: older });
      db.run(
        sql`insert into jobs (kind, params, dedupe_key, status, created_at) values ('backup', '{}', 'k', 'ok', 1)`,
      );

      migrateDb(db);
      expect(db.select().from(jobs).where(eq(jobs.dedupeKey, "k")).get()).toMatchObject({
        kind: "backup",
        status: "ok",
      });
      expect(db.select().from(workerStatus).all()).toEqual([]);
      migrateDb(db); // and it is safe to run again
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
