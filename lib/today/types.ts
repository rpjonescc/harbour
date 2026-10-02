import type { WhoOnIt } from "@/lib/explain/actions";
import type { Briefing } from "@/lib/explain/briefing";
import type { ProductId } from "@/lib/products/catalog";
import type { Effort, Impact, IssueArea } from "@/lib/scan/issues";
import type { AreaValues } from "@/lib/scan/views";

/** One row of Today's score table. Null scores and deltas are gaps, never zeros. */
export type ProductScores = {
  productId: ProductId;
  /** Whether the product has a scored scan: a missing score then means its data didn't arrive. */
  scanned: boolean;
  totals: AreaValues<number | null>;
  complete: AreaValues<boolean>;
  deltas: AreaValues<number | null>;
  /** SEO scores over the last 30 days, oldest first. */
  trend: number[];
};

export type ActionPreview = {
  /** The action's id; a string for the sample's placeholders. */
  id: number | string;
  productId: ProductId;
  area: IssueArea;
  impact: Impact;
  effort: Effort;
  title: string;
  /** Why it matters, in one sentence; empty when there is none (the card leaves it out). */
  reason: string;
  /** Who's on it; null when unknown. */
  who: WhoOnIt | null;
  /** Where the action lives on the Actions board; null for the sample. */
  href: string | null;
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
  /** One plain sentence on overall health and the biggest opportunity, with the counts under it. */
  briefing: Briefing;
  scores: ProductScores[];
  /** The top active actions; the briefing counts them all. */
  actions: ActionPreview[];
  /** Active actions beyond `actions`, left for the Actions board. */
  moreActions: number;
  failures: SourceFailure[];
};
