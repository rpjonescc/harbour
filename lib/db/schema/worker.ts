import { sql } from "drizzle-orm";
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";

/**
 * The worker's heartbeat: one row (id 1). The worker writes `beat_at` at most every 30 s while it
 * loops, and `started_at` when it starts; the web process only reads it, so "is the worker
 * running" has an honest answer even while no job runs.
 */
export const workerStatus = sqliteTable(
  "worker_status",
  {
    id: integer("id").primaryKey(),
    beatAt: timestamp("beat_at").notNull(),
    startedAt: timestamp("started_at"),
  },
  (t) => [check("worker_status_single_row", sql`${t.id} = 1`)],
);
