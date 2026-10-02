import type { Product } from "@/lib/products/catalog";
import type { Issue } from "@/lib/scan/issues";
import type { SourcesView } from "@/lib/scan/sources-view";
import type { ScanState, ScoreTrend } from "@/lib/scan/views";

// Fictional data for /design: every scan component in its main states, in both themes.

export const EXAMPLE_PRODUCT: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
};

const AT = new Date("2026-10-01T05:04:00Z");

export const EXAMPLE_SCORES: ScoreTrend = {
  latest: {
    scanId: 1,
    computedAt: AT,
    formulaVersion: "v1",
    totals: { seo: 78, geo: 46, aeo: null },
    complete: { seo: true, geo: false, aeo: false },
    breakdown: [
      {
        key: "seo.technical",
        label: "Technical health",
        score: 84,
        weight: 0.35,
        evidence: "40 HTML pages; 38 have a 10–60 character title.",
        status: "ok",
      },
      {
        key: "seo.cwv",
        label: "Core Web Vitals",
        score: 31,
        weight: 0.2,
        evidence: "Lighthouse mobile performance 31.",
        status: "ok",
      },
      {
        key: "geo.llmsTxt",
        label: "llms.txt",
        score: null,
        weight: 0.15,
        evidence: "Readiness failed in this scan",
        status: "missing",
      },
      {
        key: "geo.aiEngines",
        label: "AI engine mentions",
        score: null,
        weight: 0,
        evidence: "AI engine mention checks not connected",
        status: "missing",
      },
    ],
  },
  deltas: { seo: 4, geo: -2, aeo: null },
  trend: [70, 74, 78],
};

const last = (status: "ok" | "partial" | "failed"): NonNullable<ScanState["last"]> => ({
  scanId: 1,
  status,
  startedAt: AT,
  finishedAt: AT,
  error: status === "failed" ? "All collectors failed" : null,
  failedCollectors:
    status === "ok" ? [] : [{ collector: "pagespeed", error: "PageSpeed Insights quota exceeded" }],
});

export const EXAMPLE_SCAN_STATES: { label: string; scan: ScanState }[] = [
  { label: "Never scanned", scan: { active: null, last: null } },
  {
    label: "Running",
    scan: { active: { jobId: 9, status: "running", since: AT }, last: last("ok") },
  },
  {
    label: "Running after a failed scan",
    scan: { active: { jobId: 9, status: "running", since: AT }, last: last("failed") },
  },
  { label: "Partly failed", scan: { active: null, last: last("partial") } },
  { label: "Failed", scan: { active: null, last: last("failed") } },
];

export const EXAMPLE_ISSUE: Issue = {
  id: "missing-title",
  area: "SEO",
  impact: "high",
  title: "2 pages have no title",
  problem: "Without a title, search results and AI answers have nothing to call these pages.",
  fix: "Give each page a unique, descriptive <title> of 10–60 characters.",
  check: "Each listed URL serves a <title> of 10–60 characters.",
  locations: ["https://docs.example.com/pricing", "https://docs.example.com/guides/setup"],
  total: 2,
  effort: "small",
  docs: ["research/seo/technical-seo-checklist.md"],
};

export const EXAMPLE_SOURCES: SourcesView = {
  schedule: { enabled: true, timeZone: "Europe/London" },
  connections: {
    pagespeed: false,
    searchConsoleCredentials: true,
    searchConsoleProducts: { "acme-docs": true },
  },
  products: [
    {
      productId: "acme-docs",
      name: "Acme Docs",
      lastScan: last("partial"),
      active: null,
      next: "tomorrow",
      runs: [
        { collector: "crawler", status: "ok", error: null, finishedAt: AT },
        { collector: "readiness", status: "ok", error: null, finishedAt: AT },
        {
          collector: "pagespeed",
          status: "not_configured",
          error: "HARBOUR_PAGESPEED_API_KEY is not set",
          finishedAt: AT,
        },
        { collector: "search-console", status: "skipped", error: "ran today", finishedAt: AT },
      ],
    },
  ],
};
