import type { Db } from "@/lib/db/client";
import type { Product } from "@/lib/products/catalog";
import { byImpact, deriveIssues, type Issue } from "@/lib/scan/issues";
import { scanFindings } from "@/lib/scan/product-view";
import { productScoreTrend, scanState } from "@/lib/scan/views";
import { sampleToday } from "./sample";
import type { ActionPreview, ProductScores, SourceFailure, TodaySummary } from "./types";

const TOP_ACTIONS = 3;
const WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

/** The one-line summary: how many issues are worth a look, calm unless one is high impact. */
export function headlineFor(issues: readonly Pick<Issue, "impact">[]): string {
  const n = issues.length;
  if (n === 0) return "Calm waters. Nothing needs your attention.";
  const phrase = `${WORDS[n] ?? n} ${n === 1 ? "thing" : "things"} worth your attention.`;
  return issues.some((issue) => issue.impact === "high") ? phrase : `Calm waters. ${phrase}`;
}

type ProductToday = {
  row: ProductScores;
  scannedAt: Date | null;
  scanning: boolean;
  /** When the product's last scan finished, if it failed. */
  failedAt: Date | null;
  issues: (Issue & { productId: string })[];
  failures: SourceFailure[];
};

function productToday(db: Db, productId: string, now: Date): ProductToday {
  const { latest, deltas, trend } = productScoreTrend(db, productId, now);
  const scan = scanState(db, productId);
  const issues = deriveIssues(scanFindings(db, latest?.scanId).observations);
  return {
    row: {
      productId,
      totals: latest?.totals ?? { seo: null, geo: null, aeo: null },
      complete: latest?.complete ?? { seo: false, geo: false, aeo: false },
      deltas,
      trend,
    },
    scannedAt: latest?.computedAt ?? null,
    scanning: scan.active !== null,
    failedAt: scan.last?.status === "failed" ? (scan.last.finishedAt ?? scan.last.startedAt) : null,
    issues: issues.map((issue) => ({ ...issue, productId })),
    failures: (scan.last?.failedCollectors ?? []).map((f) => ({ productId, ...f })),
  };
}

const toAction = (issue: Issue & { productId: string }): ActionPreview => ({
  id: `${issue.productId}:${issue.id}`,
  productId: issue.productId,
  area: issue.area,
  impact: issue.impact,
  title: issue.title,
  detail: issue.fix,
});

/**
 * Today from real scans, or the clearly flagged sample until some product has scores (still
 * saying whether a scan is under way, or that the last one failed and which sources failed).
 */
export function todaySummary(db: Db, products: readonly Product[], now: Date): TodaySummary {
  const perProduct = products.map((p) => productToday(db, p.id, now));
  const scanning = perProduct.some((p) => p.scanning);
  const scanned = perProduct.flatMap((p) => (p.scannedAt ? [p.scannedAt] : []));
  const failures = perProduct.flatMap((p) => p.failures);
  if (scanned.length === 0) {
    const failed = perProduct.flatMap((p) => (p.failedAt ? [p.failedAt.getTime()] : []));
    const lastFailedAt = failed.length > 0 ? new Date(Math.max(...failed)) : null;
    return { ...sampleToday(products), scanning, lastFailedAt, failures };
  }
  // Stable sort: equal impact keeps product order, then each product's rule order.
  const issues = perProduct.flatMap((p) => p.issues).sort(byImpact);
  return {
    isSample: false,
    scannedAt: new Date(Math.max(...scanned.map((d) => d.getTime()))),
    scanning,
    lastFailedAt: null,
    headline: headlineFor(issues),
    scores: perProduct.map((p) => p.row),
    actions: issues.slice(0, TOP_ACTIONS).map(toAction),
    moreActions: Math.max(0, issues.length - TOP_ACTIONS),
    failures,
  };
}
