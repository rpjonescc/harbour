import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";
import { jobs } from "./jobs";

/**
 * One row per paid API call: the complete record of paid spend. Amounts are integer micro-AUD
 * (1 AUD = 1,000,000) so fractions of a cent add up exactly.
 */
export const costs = sqliteTable(
  "costs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: timestamp("created_at").notNull(),
    // A PAID_SOURCES id: "dataforseo" | "openai" | "perplexity" | "gemini".
    provider: text("provider").notNull(),
    collector: text("collector").notNull(),
    // Null for a call that is not about one product.
    productId: text("product_id"),
    // What the provider bills by, e.g. requests or tasks.
    units: integer("units").notNull(),
    amountMicroAud: integer("amount_micro_aud").notNull(),
    jobId: integer("job_id").references(() => jobs.id),
  },
  (t) => [
    index("costs_created").on(t.createdAt),
    check("costs_units", sql`${t.units} >= 0`),
    // At most A$100 for one call: anything more is a unit-price bug, not a real call.
    check("costs_amount", sql`${t.amountMicroAud} BETWEEN 0 AND 100000000`),
  ],
);
