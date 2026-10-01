import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { purgeExpired } from "@/lib/auth/purge";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** Opens a SQLite database with Harbour's pragmas. Use ":memory:" in tests. */
export function openDb(path: string): Db {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // mkdir's mode only applies to new directories; tighten one that already existed too.
    chmodSync(dirname(path), 0o700);
  }
  const sqlite = new Database(path);
  if (path !== ":memory:") {
    chmodSync(path, 0o600);
  }
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle({ client: sqlite, schema });
}

/** Applies pending migrations from ./drizzle. Safe to run repeatedly. */
export function migrateDb(db: Db): void {
  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
}

let instance: Db | undefined;

/** The process-wide database, migrated on first use. */
export function getDb(): Db {
  if (!instance) {
    instance = openDb(getConfig().HARBOUR_DB_PATH);
    migrateDb(instance);
    purgeExpired(instance);
  }
  return instance;
}
