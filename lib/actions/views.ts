import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions, brainDocs } from "@/lib/db/schema";
import { type WhoOnIt, whoIsOnIt } from "@/lib/explain/actions";
import type { Impact } from "@/lib/scan/issues";
import { readDocs, readEvidence } from "./evidence";
import { lastStatusActor } from "./status-actor";
import { historyTruncated } from "./store";
import { ACTION_STATUSES, ACTIVE, type ActionRow, type ActionStatus } from "./types";

const AREAS = ["SEO", "GEO", "AEO"] as const;
const STATUS_FILTERS = ["active", "suggested", "snoozed", "done", "dismissed", "all"] as const;
const IMPACTS: readonly Impact[] = ["high", "medium", "low"];

export type ActionFilter = {
  /** null = all configured products. */
  productId: string | null;
  area: (typeof AREAS)[number] | null;
  /** active = open + in_progress. */
  status: (typeof STATUS_FILTERS)[number];
};
export type ActionEventView = Pick<
  typeof actionEvents.$inferSelect,
  "at" | "actor" | "from" | "to" | "note"
>;
/**
 * An action for the board. Stored evidence and docs are re-validated: a value that fails is
 * shown as a gap (empty, with the matching `…Invalid` flag), never trusted.
 */
export type ActionView = ActionRow & {
  events: ActionEventView[];
  /** Pruning dropped the oldest events ("older history pruned"). */
  historyTruncated: boolean;
  docLinks: { path: string; exists: boolean }[];
  evidenceInvalid: boolean;
  docsInvalid: boolean;
  /** Who's on it (spec §3); null for done, snoozed and dismissed. */
  who: WhoOnIt | null;
};
export type ActionGroup = { impact: Impact; actions: ActionView[] };

function statusesFor(filter: ActionFilter["status"]): readonly ActionStatus[] {
  if (filter === "active") return ACTIVE;
  if (filter === "all") return ACTION_STATUSES;
  return [filter];
}

const impactRank = sql`CASE ${actions.impact} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;
const startedFirst = sql`CASE WHEN ${actions.status} = 'in_progress' THEN 0 ELSE 1 END`;
const effortRank = sql`CASE ${actions.effort} WHEN 'small' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;
/** Board order: impact high → low, in progress first, effort small → large, then oldest. */
const BOARD_ORDER = [impactRank, startedFirst, effortRank, asc(actions.createdAt), asc(actions.id)];
/** Finished work (done, dismissed): impact high → low, then the latest status change first. */
const RECENT_ORDER = [impactRank, desc(actions.statusChangedAt), desc(actions.id)];

type Selection = {
  productIds: readonly string[];
  statuses: readonly ActionStatus[];
  area?: ActionFilter["area"];
  recentFirst?: boolean;
};

function whereOf({ productIds, statuses, area = null }: Selection) {
  return and(
    inArray(actions.productId, [...productIds]),
    inArray(actions.status, [...statuses]),
    area === null ? undefined : eq(actions.area, area),
  );
}

/** At most `limit` matching actions in board order, and how many matched in all. */
function selectActions(
  db: Db,
  selection: Selection,
  limit: number,
): { rows: ActionRow[]; total: number } {
  if (selection.productIds.length === 0) return { rows: [], total: 0 };
  const rows =
    limit < 1
      ? []
      : db
          .select()
          .from(actions)
          .where(whereOf(selection))
          .orderBy(...(selection.recentFirst ? RECENT_ORDER : BOARD_ORDER))
          .limit(limit)
          .all();
  // Only a full page can have more behind it; skip the count otherwise.
  return { rows, total: rows.length < limit ? rows.length : countActions(db, selection) };
}

function countActions(db: Db, selection: Selection): number {
  const row = db.select({ n: count() }).from(actions).where(whereOf(selection)).get();
  return row?.n ?? 0;
}

function eventsByAction(db: Db, ids: number[]): Map<number, ActionEventView[]> {
  const byAction = new Map<number, ActionEventView[]>();
  if (ids.length === 0) return byAction;
  const rows = db
    .select()
    .from(actionEvents)
    .where(inArray(actionEvents.actionId, ids))
    .orderBy(asc(actionEvents.id))
    .all();
  for (const { actionId, at, actor, from, to, note } of rows) {
    const list = byAction.get(actionId) ?? [];
    list.push({ at, actor, from, to, note });
    byAction.set(actionId, list);
  }
  return byAction;
}

function indexedPaths(db: Db, paths: string[]): Set<string> {
  if (paths.length === 0) return new Set();
  const rows = db
    .select({ path: brainDocs.path })
    .from(brainDocs)
    .where(inArray(brainDocs.path, paths))
    .all();
  return new Set(rows.map((row) => row.path));
}

function toViews(db: Db, rows: ActionRow[]): ActionView[] {
  const events = eventsByAction(
    db,
    rows.map((row) => row.id),
  );
  const read = rows.map((row) => ({ row, docs: readDocs(row.docs) }));
  const existing = indexedPaths(db, [...new Set(read.flatMap((r) => r.docs.docs))]);
  return read.map(({ row, docs }) => {
    const history = events.get(row.id) ?? [];
    const { evidence, invalid: evidenceInvalid } = readEvidence(row.evidence);
    return {
      ...row,
      evidence,
      docs: docs.docs,
      events: history,
      historyTruncated: historyTruncated(history),
      docLinks: docs.docs.map((path) => ({ path, exists: existing.has(path) })),
      evidenceInvalid,
      docsInvalid: docs.invalid,
      who: whoIsOnIt({
        status: row.status,
        prUrl: row.prUrl,
        statusActor: lastStatusActor(history),
      }),
    };
  });
}

/** Most actions the board shows at once; the rest are counted ("N more aren't shown. Use the filters above to narrow the list."). */
export const MAX_BOARD_ACTIONS = 200;

/**
 * Configured products only, at most MAX_BOARD_ACTIONS; grouped high → low; within a group
 * in_progress first, then effort small → large, then oldest (done and dismissed: latest
 * status change first). `more` counts matching actions not shown.
 */
export function boardActions(
  db: Db,
  filter: ActionFilter,
  productIds: readonly string[],
): { groups: ActionGroup[]; more: number } {
  const products =
    filter.productId === null ? productIds : productIds.filter((id) => id === filter.productId);
  const { rows, total } = selectActions(
    db,
    {
      productIds: products,
      statuses: statusesFor(filter.status),
      area: filter.area,
      recentFirst: filter.status === "done" || filter.status === "dismissed",
    },
    MAX_BOARD_ACTIONS,
  );
  const views = toViews(db, rows);
  const groups = IMPACTS.map((impact) => ({
    impact,
    actions: views.filter((view) => view.impact === impact),
  })).filter((group) => group.actions.length > 0);
  return { groups, more: total - rows.length };
}

/** How many actions each status holds, for configured products. */
export function actionCounts(db: Db, productIds: readonly string[]): Record<ActionStatus, number> {
  const counts = Object.fromEntries(ACTION_STATUSES.map((s) => [s, 0])) as Record<
    ActionStatus,
    number
  >;
  if (productIds.length === 0) return counts;
  const rows = db
    .select({ status: actions.status, n: count() })
    .from(actions)
    .where(inArray(actions.productId, [...productIds]))
    .groupBy(actions.status)
    .all();
  for (const { status, n } of rows) counts[status] = n;
  return counts;
}

/** open + in_progress, for the sidebar badge. */
export function openActionCount(db: Db, productIds: readonly string[]): number {
  const counts = actionCounts(db, productIds);
  return ACTIVE.reduce((sum, status) => sum + counts[status], 0);
}

/** Top `n` active actions across products (same order as the board) and how many more there are. */
export function topActiveActions(
  db: Db,
  productIds: readonly string[],
  n: number,
): { actions: ActionRow[]; more: number } {
  const { rows, total } = selectActions(db, { productIds, statuses: ACTIVE }, n);
  return { actions: rows, more: total - rows.length };
}

/** Where a rule's action stands, for the product page's issues, and who is on it. */
export type RuleActionStatus = Pick<ActionRow, "id" | "status" | "snoozedUntil"> & {
  who: WhoOnIt | null;
};

/** ruleKey → { id, status, snoozedUntil, who } for one product's rule actions. */
export function ruleActionStatuses(db: Db, productId: string): Map<string, RuleActionStatus> {
  const rows = db
    .select({
      ruleKey: actions.ruleKey,
      id: actions.id,
      status: actions.status,
      snoozedUntil: actions.snoozedUntil,
      prUrl: actions.prUrl,
    })
    .from(actions)
    .where(and(eq(actions.productId, productId), eq(actions.source, "rule")))
    .all();
  // A product has at most a handful of rules, so reading each one's history is cheap.
  const events = eventsByAction(
    db,
    rows.map((row) => row.id),
  );
  return new Map(
    rows.flatMap(({ ruleKey, prUrl, ...rest }) =>
      ruleKey === null
        ? []
        : [
            [
              ruleKey,
              {
                ...rest,
                who: whoIsOnIt({
                  status: rest.status,
                  prUrl,
                  statusActor: lastStatusActor(events.get(rest.id) ?? []),
                }),
              },
            ] as const,
          ],
    ),
  );
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** The board filter from URL search params; unknown or repeated values fall back to defaults. */
export function parseActionFilter(
  params: Record<string, string | string[] | undefined>,
  productIds: readonly string[],
): ActionFilter {
  return {
    productId: oneOf(params.product, productIds),
    area: oneOf(params.area, AREAS),
    status: oneOf(params.status, STATUS_FILTERS) ?? "active",
  };
}
