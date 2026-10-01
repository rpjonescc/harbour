import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { purgeExpired } from "@/lib/auth/purge";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * The raw better-sqlite3 connection behind a database from `openDb` (the online backup needs
 * it). `Db` also types transactions, which have none, hence the check.
 */
export function connectionOf(db: Db): Database.Database {
  const client: unknown = "$client" in db ? db.$client : undefined;
  if (!(client instanceof Database)) throw new Error("Not a top-level database connection");
  return client;
}

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
