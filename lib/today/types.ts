import type { ProductId } from "@/lib/products/catalog";
import type { Impact, IssueArea } from "@/lib/scan/issues";
import type { AreaValues } from "@/lib/scan/views";

/** One row of Today's score table. Null scores and deltas are gaps, never zeros. */
export type ProductScores = {
  productId: ProductId;
  totals: AreaValues<number | null>;
  complete: AreaValues<boolean>;
  deltas: AreaValues<number | null>;
  /** SEO scores over the last 30 days, oldest first. */
  trend: number[];
};

export type ActionPreview = {
  id: string;
  productId: ProductId;
  area: IssueArea;
  impact: Impact;
  title: string;
  /** What to do, or an effort estimate. */
  detail: string;
};

/** A collector that failed in a product's last scan. */
export type SourceFailure = { productId: ProductId; collector: string; error: string | null };

export type TodaySummary = {
  isSample: boolean;
  /** When the most recent scored scan finished; null before the first. */
  scannedAt: Date | null;
  /**
   * When the newest scan finished, if it failed and no scan has been scored yet (Today then says
   * so rather than "no scan yet"); null otherwise.
   */
  lastFailedAt: Date | null;
  /** A scan is queued or running for some product. */
  scanning: boolean;
  headline: string;
  scores: ProductScores[];
  actions: ActionPreview[];
  failures: SourceFailure[];
};
