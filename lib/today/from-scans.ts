import type { Db } from "@/lib/db/client";
import { buildBriefing } from "@/lib/explain/briefing";
import type { Product } from "@/lib/products/catalog";
import { productScoreTrend, scanState } from "@/lib/scan/views";
import { attentionFromActions } from "./from-actions";
import { sampleToday } from "./sample";
import type { ProductScores, SourceFailure, TodaySummary } from "./types";

type ProductToday = {
  row: ProductScores;
  scannedAt: Date | null;
  scanning: boolean;
  /** When the product's last scan finished, if it failed. */
  failedAt: Date | null;
  failures: SourceFailure[];
};

function productToday(db: Db, productId: string, now: Date): ProductToday {
  const { latest, deltas, trend } = productScoreTrend(db, productId, now);
  const scan = scanState(db, productId);
  return {
    row: {
      productId,
      scanned: latest !== null,
      totals: latest?.totals ?? { seo: null, geo: null, aeo: null },
      complete: latest?.complete ?? { seo: false, geo: false, aeo: false },
      deltas,
      trend,
    },
    scannedAt: latest?.computedAt ?? null,
    scanning: scan.active !== null,
    failedAt: scan.last?.status === "failed" ? (scan.last.finishedAt ?? scan.last.startedAt) : null,
    failures: (scan.last?.failedCollectors ?? []).map((f) => ({ productId, ...f })),
  };
}

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
    return { ...sampleToday(products, failures), scanning, lastFailedAt };
  }
  // Actions are current here because the scan job runs the rule sync in the same job as scoring.
  const attention = attentionFromActions(
    db,
    products.map((p) => p.id),
  );
  const scores = perProduct.map((p) => p.row);
  return {
    isSample: false,
    scannedAt: new Date(Math.max(...scanned.map((d) => d.getTime()))),
    scanning,
    lastFailedAt: null,
    briefing: buildBriefing({ products, scores, work: attention.work, failures }),
    scores,
    actions: attention.actions,
    moreActions: attention.more,
    failures,
  };
}
