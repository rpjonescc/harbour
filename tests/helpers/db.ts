import { type Db, migrateDb, openDb } from "@/lib/db/client";

/** Fresh, fully migrated in-memory database for a test. */
export function openTestDb(): Db {
  const db = openDb(":memory:");
  migrateDb(db);
  return db;
}
