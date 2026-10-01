import { sql } from "drizzle-orm";
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Evidence } from "@/lib/actions/types";

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

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", {
      enum: ["research", "discovery", "brain-push", "notes-sync", "scan", "weekly-analyst"],
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

export const actions = sqliteTable(
  "actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    area: text("area", { enum: ["SEO", "GEO", "AEO"] }).notNull(),
    title: text("title").notNull(),
    why: text("why").notNull(),
    fix: text("fix").notNull(),
    // The acceptance check: how the owner knows the action is done.
    check: text("check").notNull(),
    impact: text("impact", { enum: ["high", "medium", "low"] }).notNull(),
    effort: text("effort", { enum: ["small", "medium", "large"] }).notNull(),
    evidence: text("evidence", { mode: "json" }).$type<Evidence>().notNull(),
    docs: text("docs", { mode: "json" }).$type<string[]>().notNull(),
    source: text("source", { enum: ["rule", "agent"] }).notNull(),
    // The rule id; set iff source = rule.
    ruleKey: text("rule_key"),
    // The agent job that suggested it.
    sourceJobId: integer("source_job_id").references(() => jobs.id),
    // Normalised title, so agent re-runs don't suggest the same action twice.
    titleKey: text("title_key").notNull(),
    status: text("status", {
      enum: ["suggested", "open", "in_progress", "done", "snoozed", "dismissed"],
    }).notNull(),
    // YYYY-MM-DD in HARBOUR_TIMEZONE; set iff snoozed.
    snoozedUntil: text("snoozed_until"),
    // Rule actions: whether the last judged scan found the issue.
    issuePresent: integer("issue_present", { mode: "boolean" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    statusChangedAt: timestamp("status_changed_at").notNull(),
  },
  (t) => [
    uniqueIndex("actions_product_rule")
      .on(t.productId, t.ruleKey)
      .where(sql`${t.ruleKey} IS NOT NULL`),
    index("actions_status").on(t.status, t.productId),
    index("actions_product_title").on(t.productId, t.titleKey),
    check("actions_rule_source", sql`(${t.source} = 'rule') = (${t.ruleKey} IS NOT NULL)`),
    check("actions_snooze", sql`(${t.status} = 'snoozed') = (${t.snoozedUntil} IS NOT NULL)`),
  ],
);

export const actionEvents = sqliteTable(
  "action_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actionId: integer("action_id")
      .notNull()
      .references(() => actions.id),
    at: timestamp("at").notNull(),
    actor: text("actor", { enum: ["owner", "scan", "agent", "system"] }).notNull(),
    // Null on creation.
    from: text("from_status"),
    to: text("to_status").notNull(),
    note: text("note"),
  },
  (t) => [index("action_events_action").on(t.actionId, t.id)],
);
