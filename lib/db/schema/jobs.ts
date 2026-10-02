import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", {
      enum: [
        "research",
        "discovery",
        "brain-push",
        "notes-sync",
        "scan",
        "weekly-analyst",
        "daily-note",
        "backup",
        "retention",
      ],
    }).notNull(),
    params: text("params", { mode: "json" }).$type<Record<string, string>>().notNull(),
    // Stable identity of the request, used to avoid queueing the same job twice.
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status", { enum: ["queued", "running", "ok", "failed", "cancelled"] }).notNull(),
    requestedBy: text("requested_by"),
    createdAt: timestamp("created_at").notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    heartbeatAt: timestamp("heartbeat_at"),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    // A deferred job is not claimed before this time (e.g. while the owner edits the brain).
    notBefore: timestamp("not_before"),
    error: text("error"),
  },
  (t) => [index("jobs_status").on(t.status), index("jobs_dedupe_key").on(t.dedupeKey)],
);

export const agentRuns = sqliteTable("agent_runs", {
  jobId: integer("job_id")
    .primaryKey()
    .references(() => jobs.id),
  promptVersion: text("prompt_version").notNull(),
  exitCode: integer("exit_code"),
  filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
  commitSha: text("commit_sha"),
  pushed: integer("pushed", { mode: "boolean" }),
  stdoutTail: text("stdout_tail"),
  stderrTail: text("stderr_tail"),
  // Import of the run's output file: when it happened (null = still due) and attempts so far.
  importedAt: timestamp("imported_at"),
  importAttempts: integer("import_attempts").notNull().default(0),
});

export const agentRunEvents = sqliteTable(
  "agent_run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    at: timestamp("at").notNull(),
    kind: text("kind", { enum: ["status", "tool", "text", "error"] }).notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("agent_run_events_job_id").on(t.jobId, t.id)],
);

export const proposals = sqliteTable(
  "proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    type: text("type", { enum: ["keyword", "question", "competitor"] }).notNull(),
    value: text("value", { mode: "json" }).$type<Record<string, string>>().notNull(),
    // Normalised identity (e.g. lower-cased term) so re-runs don't duplicate items.
    key: text("key").notNull(),
    why: text("why").notNull(),
    status: text("status", { enum: ["proposed", "approved", "rejected"] }).notNull(),
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
    sourceJobId: integer("source_job_id").references(() => jobs.id),
    createdAt: timestamp("created_at").notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [uniqueIndex("proposals_product_type_key").on(t.productId, t.type, t.key)],
);
