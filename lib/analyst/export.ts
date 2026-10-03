// The weekly analyst's data: what Harbour knows about each product's last 7 days. Worker only.
import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import type { ActionStatus } from "@/lib/actions/types";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import type { Impact } from "@/lib/scan/issues";
import type { CollectorStatus } from "@/lib/scan/types";
import { productExport } from "./export-product";

type Totals<T> = { seo: T; geo: T; aeo: T };

export type ProductExport = {
  id: string;
  name: string;
  url: string;
  /** Ok and partial scans in the window, oldest first. */
  scores: {
    date: string;
    /** The scoring formula that produced the numbers; scores of different versions can't be compared. */
    formulaVersion: string;
    seo: number | null;
    geo: number | null;
    aeo: number | null;
    complete: Totals<boolean>;
  }[];
  /** Latest − baseline (last scored scan at or before the window start, else first in window). */
  deltas: Totals<number | null>;
  /** The latest scored scan's breakdown. */
  subScores: {
    key: string;
    label: string;
    score: number | null;
    status: "ok" | "missing";
    evidence: string;
  }[];
  issues: { id: string; title: string; impact: Impact; total: number; examples: string[] }[];
  collectors: { collector: string; status: CollectorStatus; error: string | null }[];
  searchConsole: { clicks: number; impressions: number; priorImpressions: number | null } | null;
  competitors: { name: string; url: string; status: "approved" | "proposed" }[];
};

export type WeeklyExport = {
  week: string;
  generatedAt: string;
  timeZone: string;
  /** 7 days ending now, local dates. */
  window: { from: string; to: string };
  products: ProductExport[];
  /** Suggested, open, in progress and snoozed actions. */
  actions: {
    id: number;
    productId: string;
    area: string;
    title: string;
    impact: Impact;
    status: ActionStatus;
    source: "rule" | "agent" | "manual";
    ageDays: number;
  }[];
  /** Newest first. */
  resolvedThisWeek: { productId: string; title: string; at: string }[];
  /** What capExport cut, in order. */
  truncated: string[];
};

const DAY_MS = 24 * 60 * 60_000;
const LISTED: ActionStatus[] = ["suggested", "open", "in_progress", "snoozed"];

function listedActions(db: Db, productIds: string[], now: Date): WeeklyExport["actions"] {
  return db
    .select()
    .from(actions)
    .where(and(inArray(actions.productId, productIds), inArray(actions.status, LISTED)))
    .orderBy(asc(actions.id))
    .all()
    .map((a) => ({
      id: a.id,
      productId: a.productId,
      area: a.area,
      title: a.title,
      impact: a.impact,
      status: a.status,
      source: a.source,
      ageDays: Math.max(0, Math.floor((now.getTime() - a.createdAt.getTime()) / DAY_MS)),
    }));
}

function resolvedSince(
  db: Db,
  productIds: string[],
  start: Date,
  now: Date,
): WeeklyExport["resolvedThisWeek"] {
  return db
    .select()
    .from(actions)
    .where(
      and(
        inArray(actions.productId, productIds),
        eq(actions.status, "done"),
        gt(actions.statusChangedAt, start),
        lte(actions.statusChangedAt, now),
      ),
    )
    .orderBy(desc(actions.statusChangedAt), desc(actions.id))
    .all()
    .map((a) => ({ productId: a.productId, title: a.title, at: a.statusChangedAt.toISOString() }));
}

/** The analyst's export for `week`: configured products only, with gaps left as null. */
export function buildWeeklyExport(
  db: Db,
  input: { products: readonly Product[]; week: string; now: Date; timeZone: string },
): WeeklyExport {
  const { now, timeZone } = input;
  const start = new Date(now.getTime() - 7 * DAY_MS);
  const ids = input.products.map((p) => p.id);
  return {
    week: input.week,
    generatedAt: now.toISOString(),
    timeZone,
    window: { from: isoDateIn(timeZone, start), to: isoDateIn(timeZone, now) },
    products: input.products.map((p) => productExport(db, p, { start, now, timeZone })),
    actions: listedActions(db, ids, now),
    resolvedThisWeek: resolvedSince(db, ids, start, now),
    truncated: [],
  };
}
