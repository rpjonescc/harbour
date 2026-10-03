import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { proposals, type ScoreBreakdownEntry, scanRuns, scores } from "@/lib/db/schema";
import { formulaChangedArea } from "@/lib/explain/scoring-notes";
import { readOutsideFacts } from "@/lib/external/read-facts";
import { isoDateIn } from "@/lib/format/date";
import { getTracking, type Product, type ProductKind } from "@/lib/products/catalog";
import { deriveIssues } from "@/lib/scan/issues";
import { scanFindings } from "@/lib/scan/product-view";
import { searchSummary } from "@/lib/scan/search-summary";
import type { ScanObservation } from "@/lib/scan/types";
import { gscRows } from "@/lib/scan/view-shapes";
import type { AreaKey } from "@/lib/scan/views";
import type { ProductExport } from "./export";
import { scrub } from "./scrub";

const MAX_EXAMPLES = 5;
type ScoreRow = {
  scanId: number;
  computedAt: Date;
  formulaVersion: string;
  seo: number | null;
  geo: number | null;
  aeo: number | null;
  complete: { seo: boolean; geo: boolean; aeo: boolean };
  breakdown: ScoreBreakdownEntry[];
};

/**
 * Scores of the product's ok and partial scans up to `now`, oldest first (failed scans never
 * count).
 */
function scoreRows(db: Db, productId: string, now: Date): ScoreRow[] {
  return db
    .select({
      scanId: scores.scanId,
      computedAt: scores.computedAt,
      formulaVersion: scores.formulaVersion,
      seo: scores.seo,
      geo: scores.geo,
      aeo: scores.aeo,
      complete: scores.complete,
      breakdown: scores.breakdown,
    })
    .from(scores)
    .innerJoin(scanRuns, eq(scores.scanId, scanRuns.id))
    .where(
      and(
        eq(scores.productId, productId),
        inArray(scanRuns.status, ["ok", "partial"]),
        lte(scores.computedAt, now),
      ),
    )
    .orderBy(asc(scores.computedAt), asc(scores.id))
    .all();
}

/** Null when either has no number: no change measured is a gap, not a zero. */
const diff = (now: number | null | undefined, before: number | null | undefined) =>
  now == null || before == null ? null : now - before;

/**
 * Latest − baseline, where the baseline is the last scored scan at or before the window start,
 * else the first in the window. With nothing to compare (no scan in the window, or just one
 * and none before) every delta is null: no change measured is a gap, not a zero. So is the
 * delta of an area whose formula changed between the two scans, which measures the formula, not
 * the site.
 */
function deltas(rows: ScoreRow[], series: ScoreRow[], kind: ProductKind): ProductExport["deltas"] {
  const latest = series.at(-1);
  const before = rows.filter((r) => !series.includes(r)).at(-1);
  const baseline = before ?? (series.length > 1 ? series[0] : undefined);
  if (!latest || !baseline) return { seo: null, geo: null, aeo: null };
  const change = (area: AreaKey) =>
    formulaChangedArea(kind, area, baseline.formulaVersion, latest.formulaVersion)
      ? null
      : diff(latest[area], baseline[area]);
  return { seo: change("seo"), geo: change("geo"), aeo: change("aeo") };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function searchConsole(
  observations: ScanObservation[],
  ok: boolean,
): ProductExport["searchConsole"] {
  const summary = ok ? searchSummary(observations) : null;
  if (!summary) return null;
  const prior = gscRows(observations, "gsc_prior_daily");
  return {
    clicks: summary.clicks,
    impressions: summary.impressions,
    priorImpressions: prior.length ? sum(prior.map((r) => r.impressions)) : null,
  };
}

function competitors(db: Db, productId: string): ProductExport["competitors"] {
  return db
    .select({ value: proposals.value, status: proposals.status })
    .from(proposals)
    .where(
      and(
        eq(proposals.productId, productId),
        eq(proposals.type, "competitor"),
        inArray(proposals.status, ["approved", "proposed"]),
      ),
    )
    .orderBy(asc(proposals.id))
    .all()
    .map(({ value, status }) => ({
      name: value.name ?? "",
      url: value.url ?? "",
      status: status === "approved" ? "approved" : "proposed",
    }));
}

/** One product's week: score series and deltas, and what its latest scored scan found. */
export function productExport(
  db: Db,
  product: Product,
  window: { start: Date; now: Date; timeZone: string },
): ProductExport {
  const rows = scoreRows(db, product.id, window.now);
  const series = rows.filter((r) => r.computedAt > window.start);
  const latest = rows.at(-1);
  const { observations, runs, statuses } = scanFindings(db, latest?.scanId);
  return {
    id: product.id,
    name: product.name,
    url: product.url,
    scores: series.map((r) => ({
      date: isoDateIn(window.timeZone, r.computedAt),
      formulaVersion: r.formulaVersion,
      seo: r.seo,
      geo: r.geo,
      aeo: r.aeo,
      complete: r.complete,
    })),
    deltas: deltas(rows, series, product.kind),
    subScores: (latest?.breakdown ?? []).map(({ key, label, score, weight, status, evidence }) => ({
      key,
      label,
      score,
      weight,
      status,
      evidence,
    })),
    issues: deriveIssues(
      observations,
      statuses,
      product.kind,
      readOutsideFacts(db, product, getTracking(product.id)?.questions ?? [], window.now),
    ).map((issue) => ({
      id: issue.id,
      title: issue.title,
      impact: issue.impact,
      total: issue.total,
      examples: issue.locations.slice(0, MAX_EXAMPLES).map(scrub),
    })),
    collectors: runs.map(({ collector, status, error }) => ({
      collector,
      status,
      error: error === null ? null : scrub(error),
    })),
    searchConsole: searchConsole(observations, statuses["search-console"] === "ok"),
    competitors: competitors(db, product.id),
  };
}
