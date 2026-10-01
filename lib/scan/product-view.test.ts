import { openTestDb } from "@/tests/helpers/db";
import { daysAfter, seedScan, T0 } from "@/tests/helpers/scan-views";
import { ACME_CRAWL, readiness } from "@/tests/helpers/scoring";
import { productView } from "./product-view";
import type { Observation, ScanObservation } from "./types";

const strip = (list: ScanObservation[]): Observation[] =>
  list.map(({ kind, subject, value }) => ({ kind, subject, value }));
const crawler = (status: "ok" | "failed" = "ok") => ({
  collector: "crawler",
  status,
  observations: status === "ok" ? strip(ACME_CRAWL) : undefined,
});
const readinessRun = {
  collector: "readiness",
  status: "ok" as const,
  observations: strip([readiness()]),
};
const gscSummary: Observation = {
  kind: "gsc_summary",
  subject: "sc-domain:docs.example.com",
  value: { startDate: "2026-09-01", endDate: "2026-09-28" },
};

describe("productView", () => {
  it("is empty for a product that was never scanned", () => {
    const view = productView(openTestDb(), "acme-docs", T0);
    expect(view.scores.latest).toBeNull();
    expect(view.issues).toEqual([]);
    expect(view.pages).toEqual({ rows: [], total: 0 });
    expect(view.search).toEqual({ state: "none", reason: null });
  });

  it("reads issues, pages and Search Console from the scan behind the latest scores", () => {
    const db = openTestDb();
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      runs: [
        crawler(),
        readinessRun,
        { collector: "search-console", status: "ok", observations: [gscSummary] },
      ],
    });
    // A later failed scan is left out: the page keeps showing the last good scan's findings.
    seedScan(db, { productId: "acme-docs", at: T0, status: "failed", runs: [crawler("failed")] });
    const view = productView(db, "acme-docs", T0);
    expect(view.issues.map((i) => i.id)).toEqual([
      "broken-links",
      "noindex",
      "ai-crawlers-blocked",
    ]);
    expect(view.pages.total).toBe(6);
    expect(view.search).toMatchObject({ state: "ok", summary: { clicks: 0, days: [] } });
    expect(view.scan.last?.status).toBe("failed");
  });

  it("says why Search Console has no data", () => {
    const db = openTestDb();
    seedScan(db, {
      productId: "acme-docs",
      at: T0,
      runs: [
        crawler(),
        {
          collector: "search-console",
          status: "not_configured",
          error: "HARBOUR_GSC_CREDENTIALS is not set",
        },
      ],
    });
    expect(productView(db, "acme-docs", T0).search).toEqual({
      state: "not_configured",
      reason: "HARBOUR_GSC_CREDENTIALS is not set",
    });
  });
});
