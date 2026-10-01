import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";
import { jobs } from "./jobs";

export const scanRuns = sqliteTable(
  "scan_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    status: text("status", { enum: ["running", "ok", "partial", "failed"] }).notNull(),
  },
  (t) => [index("scan_runs_product").on(t.productId, t.id)],
);

export const collectorRuns = sqliteTable(
  "collector_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scanRuns.id),
    collector: text("collector").notNull(),
    status: text("status", { enum: ["ok", "failed", "not_configured", "skipped"] }).notNull(),
    // Why it failed, isn't configured or was skipped; null when ok.
    error: text("error"),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at").notNull(),
    // Observations stored; null unless ok.
    items: integer("items"),
  },
  (t) => [
    index("collector_runs_scan").on(t.scanId),
    index("collector_runs_collector").on(t.collector, t.status),
  ],
);

export const observations = sqliteTable(
  "observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scanRuns.id),
    collector: text("collector").notNull(),
    // e.g. page, site, robots, cwv, gsc_daily, gsc_query
    kind: text("kind").notNull(),
    // A URL, query or date, depending on kind.
    subject: text("subject").notNull(),
    value: text("value", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("observations_scan_collector_kind").on(t.scanId, t.collector, t.kind)],
);

export type ScoreBreakdownEntry = {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  evidence: string;
  status: "ok" | "missing";
};

export const scores = sqliteTable(
  "scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id")
      .notNull()
      .unique()
      .references(() => scanRuns.id),
    productId: text("product_id").notNull(),
    computedAt: timestamp("computed_at").notNull(),
    formulaVersion: text("formula_version").notNull(),
    // Null when no input for that score was available (a gap, never a zero).
    seo: integer("seo"),
    geo: integer("geo"),
    aeo: integer("aeo"),
    complete: text("complete", { mode: "json" })
      .$type<{ seo: boolean; geo: boolean; aeo: boolean }>()
      .notNull(),
    breakdown: text("breakdown", { mode: "json" }).$type<ScoreBreakdownEntry[]>().notNull(),
  },
  (t) => [
    index("scores_product").on(t.productId, t.computedAt),
    check("scores_seo_range", sql`${t.seo} IS NULL OR ${t.seo} BETWEEN 0 AND 100`),
    check("scores_geo_range", sql`${t.geo} IS NULL OR ${t.geo} BETWEEN 0 AND 100`),
    check("scores_aeo_range", sql`${t.aeo} IS NULL OR ${t.aeo} BETWEEN 0 AND 100`),
  ],
);
