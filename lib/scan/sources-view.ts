import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { type NextDailyScan, nextDailyScan } from "@/lib/jobs/scan-schedule";
import type { Product } from "@/lib/products/catalog";
import { COLLECTOR_IDS } from "./labels";
import type { CollectorStatus } from "./types";
import { latestCollectorRuns, latestScanJobAt, type ScanState, scanState } from "./views";

/** A collector's latest run for a product; status null when it never ran. */
export type SourceRun = {
  collector: string;
  status: CollectorStatus | null;
  error: string | null;
  finishedAt: Date | null;
};

export type ProductSources = {
  productId: string;
  name: string;
  lastScan: ScanState["last"];
  active: ScanState["active"];
  next: NextDailyScan;
  runs: SourceRun[];
};

/** What the Sources page shows. Connections are booleans: secrets never leave the server. */
export type SourcesView = {
  schedule: { enabled: boolean; timeZone: string };
  connections: {
    pagespeed: boolean;
    searchConsoleCredentials: boolean;
    /** Whether each product names a Search Console property. */
    searchConsoleProducts: Record<string, boolean>;
  };
  products: ProductSources[];
};

function productSources(db: Db, product: Product, config: Config, now: Date): ProductSources {
  const scan = scanState(db, product.id);
  const latest = latestCollectorRuns(db, product.id);
  const enabled = config.HARBOUR_SCHEDULED_SCANS === "on";
  return {
    productId: product.id,
    name: product.name,
    lastScan: scan.last,
    active: scan.active,
    next: nextDailyScan(now, config.HARBOUR_TIMEZONE, enabled, latestScanJobAt(db, product.id)),
    runs: COLLECTOR_IDS.map((collector) => {
      const run = latest.find((r) => r.collector === collector);
      return run ?? { collector, status: null, error: null, finishedAt: null };
    }),
  };
}

/** The scan schedule, which sources are connected, and each source's last run per product. */
export function sourcesView(
  db: Db,
  products: readonly Product[],
  config: Config,
  now: Date,
): SourcesView {
  return {
    schedule: {
      enabled: config.HARBOUR_SCHEDULED_SCANS === "on",
      timeZone: config.HARBOUR_TIMEZONE,
    },
    connections: {
      pagespeed: Boolean(config.HARBOUR_PAGESPEED_API_KEY),
      searchConsoleCredentials: Boolean(config.HARBOUR_GSC_CREDENTIALS),
      searchConsoleProducts: Object.fromEntries(
        products.map((p) => [p.id, Boolean(p.searchConsoleProperty)]),
      ),
    },
    products: products.map((p) => productSources(db, p, config, now)),
  };
}
