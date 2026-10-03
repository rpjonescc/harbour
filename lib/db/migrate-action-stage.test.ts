import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrateDb, openDb } from "./client";
import { actionEvents, actions } from "./schema";

describe("the action stage migration", () => {
  it("keeps existing actions and events with a null stage", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-mig-"));
    try {
      const older = join(dir, "drizzle");
      cpSync(join(process.cwd(), "drizzle"), older, { recursive: true });
      const journalFile = join(older, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
        entries: { tag: string }[];
      };
      const at = journal.entries.findIndex((entry) => entry.tag.endsWith("_action_stage"));
      expect(at).toBeGreaterThan(0);
      journal.entries.splice(at);
      writeFileSync(journalFile, JSON.stringify(journal));

      const db = openDb(join(dir, "old.db"));
      migrate(db, { migrationsFolder: older });
      db.run(
        sql`insert into actions (product_id, area, title, why, fix, "check", impact, effort, evidence, docs, source, rule_key, title_key, status, created_at, updated_at, status_changed_at)
            values ('acme-docs', 'SEO', 'T', 'w', 'f', 'c', 'low', 'small', '{"items":[],"total":0}', '[]', 'rule', 'k', 't', 'in_progress', 1, 1, 1)`,
      );
      db.run(
        sql`insert into action_events (action_id, at, actor, from_status, to_status) values (1, 1, 'owner', 'open', 'in_progress')`,
      );

      migrateDb(db);
      expect(db.select().from(actions).where(eq(actions.ruleKey, "k")).get()).toMatchObject({
        status: "in_progress",
        stage: null,
      });
      expect(db.select().from(actionEvents).get()).toMatchObject({
        fromStage: null,
        toStage: null,
      });
      migrateDb(db);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
