import { blob, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  login: text("login").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastSeenAt: timestamp("last_seen_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  // The passkey that signed this session in; removing that passkey revokes the session.
  passkeyId: text("passkey_id"),
});

export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(),
  login: text("login").notNull(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull(),
  transports: text("transports", { mode: "json" }).$type<string[]>(),
  deviceLabel: text("device_label").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const authChallenges = sqliteTable("auth_challenges", {
  flowId: text("flow_id").primaryKey(),
  kind: text("kind", { enum: ["register", "authenticate"] }).notNull(),
  login: text("login").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const setupTokens = sqliteTable("setup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: timestamp("at").notNull(),
  login: text("login"),
  event: text("event").notNull(),
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const brainDocs = sqliteTable("brain_docs", {
  path: text("path").primaryKey(),
  title: text("title").notNull(),
  mtime: timestamp("mtime").notNull(),
  contentHash: text("content_hash").notNull(),
  lastViewedAt: timestamp("last_viewed_at"),
});

export const brainLinks = sqliteTable(
  "brain_links",
  {
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fromPath, table.toPath] })],
);

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["research", "discovery", "brain-push", "notes-sync"] }).notNull(),
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
  error: text("error"),
});

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
});

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  at: timestamp("at").notNull(),
  kind: text("kind", { enum: ["status", "tool", "text", "error"] }).notNull(),
  text: text("text").notNull(),
});

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
