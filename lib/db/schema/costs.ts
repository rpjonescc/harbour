import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";
import { jobs } from "./jobs";

/**
 * One row per paid API call: the complete record of paid spend. Amounts are integer micro-AUD
 * (1 AUD = 1,000,000) so fractions of a cent add up exactly. A row is `reserved` at the call's
 * estimate when the budget allows the call, then `recorded` at the actual price once it is
 * made; both count against the budget, so a crash mid-call never under-counts.
 */
export const costs = sqliteTable(
  "costs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: timestamp("created_at").notNull(),
    status: text("status", { enum: ["reserved", "recorded"] }).notNull(),
    // A PAID_SOURCES id ("dataforseo" | "openai" | …); null only while reserved.
    provider: text("provider"),
    collector: text("collector").notNull(),
    // Null for a call that is not about one product.
    productId: text("product_id"),
    // What the provider bills by, e.g. requests or tasks (0 while reserved).
    units: integer("units").notNull(),
    amountMicroAud: integer("amount_micro_aud").notNull(),
    jobId: integer("job_id").references(() => jobs.id),
  },
  (t) => [
    index("costs_created").on(t.createdAt),
    check("costs_status", sql`${t.status} IN ('reserved', 'recorded')`),
    check("costs_provider", sql`${t.status} = 'reserved' OR ${t.provider} IS NOT NULL`),
    check("costs_units", sql`${t.units} >= 0`),
    // At most A$100 for one call: anything more is a unit-price bug, not a real call.
    check("costs_amount", sql`${t.amountMicroAud} BETWEEN 0 AND 100000000`),
  ],
);
