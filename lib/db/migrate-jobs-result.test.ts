import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrateDb, openDb } from "./client";
import { jobs } from "./schema";

describe("the jobs.result migration", () => {
  it("applies on a database with older migrations and rows, keeping them with a null result", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-mig-"));
    try {
      // A copy of the migrations folder without the newest one: the schema before `result`.
      const older = join(dir, "drizzle");
      cpSync(join(process.cwd(), "drizzle"), older, { recursive: true });
      const journalFile = join(older, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
        entries: { tag: string }[];
      };
      expect(journal.entries.pop()?.tag).toBe("0012_jobs_result");
      writeFileSync(journalFile, JSON.stringify(journal));

      const db = openDb(join(dir, "old.db"));
      migrate(db, { migrationsFolder: older });
      db.run(
        sql`insert into jobs (kind, params, dedupe_key, status, created_at) values ('research', '{}', 'k', 'ok', 1)`,
      );

      migrateDb(db); // the real folder: only the newest migration is pending
      expect(db.select().from(jobs).where(eq(jobs.dedupeKey, "k")).get()).toMatchObject({
        kind: "research",
        result: null,
      });
      migrateDb(db); // and it is safe to run again
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
