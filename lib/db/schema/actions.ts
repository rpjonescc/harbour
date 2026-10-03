import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Evidence } from "@/lib/actions/types";
import { ACTION_ACTORS } from "@/lib/actions/types";
import { timestamp } from "./columns";
import { jobs } from "./jobs";

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
    source: text("source", { enum: ["rule", "agent", "manual"] }).notNull(),
    // "manual": added by hand through the CLI; it has no rule key and no job, so a scan never
    // touches it. The rule id is set iff source = rule.
    ruleKey: text("rule_key"),
    // The agent job that suggested it; set iff source = agent.
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
    // The fix's pull request (https://github.com/<owner>/<repo>/pull/<n>), linked by Claude.
    prUrl: text("pr_url"),
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
    check("actions_agent_job", sql`(${t.source} = 'agent') = (${t.sourceJobId} IS NOT NULL)`),
    check("actions_issue_present", sql`${t.source} = 'rule' OR ${t.issuePresent} IS NULL`),
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
    actor: text("actor", { enum: ACTION_ACTORS }).notNull(),
    // Null on creation.
    from: text("from_status"),
    to: text("to_status").notNull(),
    note: text("note"),
  },
  (t) => [index("action_events_action").on(t.actionId, t.id)],
);
