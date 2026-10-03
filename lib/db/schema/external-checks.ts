import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";

/**
 * The outside view's history: one row per links, search-position or AI-answer check, kept 400
 * days (scan observations are pruned with the scans, long before a weekly trend is visible). Only
 * values that passed their shape (lib/scan/treg-shapes.ts) are written, by the worker.
 */
export const externalChecks = sqliteTable(
  "external_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    // "backlinks" | "serp_rank" | "ai_answer"
    kind: text("kind").notNull(),
    // The domain, the search or the question (at most 200 characters).
    subject: text("subject").notNull(),
    checkedAt: timestamp("checked_at").notNull(),
    // The validated observation value as JSON (at most 4 KiB).
    value: text("value", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    // The scan or job that wrote it; null when unknown. Not foreign keys: pruning stays independent.
    scanId: integer("scan_id"),
    jobId: integer("job_id"),
  },
  (t) => [
    // Writing the same check twice changes nothing.
    uniqueIndex("external_checks_unique").on(t.productId, t.kind, t.subject, t.checkedAt),
    check("external_checks_kind", sql`${t.kind} IN ('backlinks', 'serp_rank', 'ai_answer')`),
    check("external_checks_subject", sql`length(${t.subject}) BETWEEN 1 AND 200`),
    check("external_checks_value", sql`length(${t.value}) <= 4096`),
    index("external_checks_lookup").on(t.productId, t.kind, t.subject, sql`${t.checkedAt} desc`),
  ],
);
