import { parseConfig } from "@/lib/config";
import { enqueueJob } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { openTestDb } from "@/tests/helpers/db";
import { daysAfter, seedScan, T0 } from "@/tests/helpers/scan-views";
import { sourcesView } from "./sources-view";

const BASE = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.ts.net",
  HARBOUR_RP_ID: "harbour.example.ts.net",
  HARBOUR_TIMEZONE: "Europe/London",
};
const products: Product[] = [
  {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber",
    kind: "product" as const,
    searchConsoleProperty: "sc-domain:docs.example.com",
  },
  {
    id: "fern-and-field",
    name: "Fern & Field",
    url: "https://fern.example.com",
    hue: "green",
    kind: "product" as const,
  },
];

describe("sourcesView", () => {
  it("reports connections as booleans only, never the secret values", () => {
    const config = parseConfig({
      ...BASE,
      HARBOUR_PAGESPEED_API_KEY: "AIza-test-not-a-real-key",
      HARBOUR_GSC_CREDENTIALS: "/srv/harbour/gsc.json",
      HARBOUR_TREG_API_KEY: "SENTINEL-treg-key",
    });
    const view = sourcesView(openTestDb(), products, config, T0);
    expect(view.connections).toEqual({
      pagespeed: true,
      searchConsoleCredentials: true,
      treg: true,
      searchConsoleProducts: { "acme-docs": true, "fern-and-field": false },
    });
    expect(JSON.stringify(view)).not.toMatch(/AIza|gsc\.json|SENTINEL/);
  });

  it("gives the schedule and, per product, the last scan, next scan and each source's last run", () => {
    const db = openTestDb();
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      status: "partial",
      runs: [
        { collector: "crawler", status: "ok" },
        { collector: "pagespeed", status: "failed", error: "quota exceeded" },
      ],
    });
    enqueueJob(db, "scan", { productId: "fern-and-field" }, null, T0);
    // 07:00 BST, after today's 06:00 slot.
    const now = new Date("2026-10-01T06:00:00Z");
    const view = sourcesView(db, products, parseConfig(BASE), now);
    expect(view.schedule).toEqual({ enabled: true, timeZone: "Europe/London" });
    expect(view.connections.pagespeed).toBe(false);
    const [acme, fern] = view.products;
    expect(acme).toMatchObject({
      productId: "acme-docs",
      lastScan: { status: "partial", finishedAt: daysAfter(-1) },
      active: null,
      next: "due",
    });
    expect(acme?.runs.map((r) => [r.collector, r.status, r.error])).toEqual([
      ["crawler", "ok", null],
      ["readiness", null, null],
      ["pagespeed", "failed", "quota exceeded"],
      ["search-console", null, null],
      ["indexing", null, null],
      ["treg", null, null],
    ]);
    expect(fern).toMatchObject({ lastScan: null, active: { status: "queued" }, next: "tomorrow" });
  });

  it("shows the schedule off when HARBOUR_SCHEDULED_SCANS is off", () => {
    const view = sourcesView(
      openTestDb(),
      products,
      parseConfig({ ...BASE, HARBOUR_SCHEDULED_SCANS: "off" }),
      T0,
    );
    expect(view.schedule.enabled).toBe(false);
    expect(view.products.every((p) => p.next === "off")).toBe(true);
  });
});
