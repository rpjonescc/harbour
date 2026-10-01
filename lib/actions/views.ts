import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions, brainDocs } from "@/lib/db/schema";
import type { Impact } from "@/lib/scan/issues";
import { readDocs, readEvidence } from "./evidence";
import { historyTruncated } from "./store";
import { ACTIVE, type ActionRow, type ActionStatus } from "./types";

const AREAS = ["SEO", "GEO", "AEO"] as const;
const STATUS_FILTERS = ["active", "suggested", "snoozed", "done", "dismissed", "all"] as const;
const STATUSES: readonly ActionStatus[] = [
  "suggested",
  "open",
  "in_progress",
  "done",
  "snoozed",
  "dismissed",
];
const IMPACTS: readonly Impact[] = ["high", "medium", "low"];
const EFFORTS = ["small", "medium", "large"] as const;

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
};
export type ActionGroup = { impact: Impact; actions: ActionView[] };

function statusesFor(filter: ActionFilter["status"]): readonly ActionStatus[] {
  if (filter === "active") return ACTIVE;
  if (filter === "all") return STATUSES;
  return [filter];
}

/** Board order: impact high → low, in progress first, effort small → large, then oldest. */
function boardOrder(a: ActionRow, b: ActionRow): number {
  return (
    IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) ||
    Number(b.status === "in_progress") - Number(a.status === "in_progress") ||
    EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id - b.id
  );
}

function selectActions(
  db: Db,
  productIds: readonly string[],
  statuses: readonly ActionStatus[],
  area: ActionFilter["area"] = null,
): ActionRow[] {
  if (productIds.length === 0) return [];
  const rows = db
    .select()
    .from(actions)
    .where(
      and(
        inArray(actions.productId, [...productIds]),
        inArray(actions.status, [...statuses]),
        area === null ? undefined : eq(actions.area, area),
      ),
    )
    .all();
  return rows.sort(boardOrder);
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
    };
  });
}

/** Configured products only; grouped high → low; within a group in_progress first, then effort small → large, then oldest. */
export function boardActions(
  db: Db,
  filter: ActionFilter,
  productIds: readonly string[],
): ActionGroup[] {
  const products =
    filter.productId === null ? productIds : productIds.filter((id) => id === filter.productId);
  const views = toViews(db, selectActions(db, products, statusesFor(filter.status), filter.area));
  return IMPACTS.map((impact) => ({
    impact,
    actions: views.filter((view) => view.impact === impact),
  })).filter((group) => group.actions.length > 0);
}

/** How many actions each status holds, for configured products. */
export function actionCounts(db: Db, productIds: readonly string[]): Record<ActionStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ActionStatus, number>;
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
  const rows = selectActions(db, productIds, ACTIVE);
  return { actions: rows.slice(0, n), more: Math.max(0, rows.length - n) };
}

/** ruleKey → { id, status, snoozedUntil } for one product's rule actions. */
export function ruleActionStatuses(
  db: Db,
  productId: string,
): Map<string, Pick<ActionRow, "id" | "status" | "snoozedUntil">> {
  const rows = db
    .select({
      ruleKey: actions.ruleKey,
      id: actions.id,
      status: actions.status,
      snoozedUntil: actions.snoozedUntil,
    })
    .from(actions)
    .where(and(eq(actions.productId, productId), eq(actions.source, "rule")))
    .all();
  return new Map(
    rows.flatMap(({ ruleKey, ...rest }) => (ruleKey === null ? [] : [[ruleKey, rest] as const])),
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
