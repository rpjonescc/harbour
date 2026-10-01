import { insertAction, setStatus } from "@/lib/actions/store";
import { decideProposal, importProposals, listProposals } from "@/lib/agents/proposals";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { deriveIssues } from "@/lib/scan/issues";
import type { Observation } from "@/lib/scan/types";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { ACME_SCAN, ALL_OK, crawlSite, htmlPage } from "@/tests/helpers/scoring";
import { buildWeeklyExport } from "./export";
import { scrub } from "./scrub";

const NOW = new Date("2026-10-04T19:00:00Z"); // Sunday 20:00 in London
const TZ = "Europe/London";
const acme = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber" as const,
};
const beta = {
  id: "beta-shop",
  name: "Beta Shop",
  url: "https://shop.example.com",
  hue: "blue" as const,
};
const quiet = {
  id: "quiet-blog",
  name: "Quiet Blog",
  url: "https://blog.example.com",
  hue: "teal" as const,
};
const at = (iso: string) => new Date(iso);

const byCollector = (collector: string): Observation[] =>
  ACME_SCAN.filter((o) => o.collector === collector).map(({ collector: _, ...o }) => o);

const BREAKDOWN: ScoreBreakdownEntry[] = [
  {
    key: "seo.titles",
    label: "Titles",
    score: 80,
    weight: 1,
    evidence: "4 of 5 pages",
    status: "ok",
  },
  {
    key: "geo.llms",
    label: "llms.txt",
    score: null,
    weight: 1,
    evidence: "not checked",
    status: "missing",
  },
];

function fixture() {
  const db = openTestDb();
  seedScan(db, {
    productId: "acme-docs",
    at: at("2026-09-25T06:00:00Z"),
    totals: { seo: 40, geo: 30, aeo: null },
  });
  seedScan(db, {
    productId: "acme-docs",
    at: at("2026-09-29T06:00:00Z"),
    totals: { seo: 45, geo: 35, aeo: 20 },
  });
  seedScan(db, {
    productId: "acme-docs",
    at: at("2026-10-01T06:00:00Z"),
    status: "failed",
    totals: { seo: 99, geo: 99, aeo: 99 },
  });
  seedScan(db, {
    productId: "acme-docs",
    at: at("2026-10-03T06:00:00Z"),
    totals: { seo: 50, geo: null, aeo: 25 },
    complete: { seo: true, geo: false, aeo: true },
    breakdown: BREAKDOWN,
    runs: [
      { collector: "crawler", status: "ok", observations: byCollector("crawler") },
      { collector: "readiness", status: "ok", observations: byCollector("readiness") },
      {
        collector: "pagespeed",
        status: "failed",
        error: "Quota for harbour@acme-harbour.iam.gserviceaccount.com; see /srv/harbour/key.json",
      },
      { collector: "search-console", status: "ok", observations: byCollector("search-console") },
    ],
  });
  seedScan(db, {
    productId: "beta-shop",
    at: at("2026-10-02T06:00:00Z"),
    totals: { seo: 60, geo: 50, aeo: 40 },
  });
  seedScan(db, { productId: "ghost", at: at("2026-10-02T06:00:00Z") });
  return db;
}

function seedActions(db: ReturnType<typeof openTestDb>) {
  const job = analystJob(db);
  const openId = insertAction(
    db,
    ruleAction({ impact: "high" }),
    "scan",
    null,
    at("2026-10-01T09:00:00Z"),
  );
  insertAction(db, agentAction(job, "Answer buyer questions"), "agent", null, NOW);
  const dismissed = insertAction(db, agentAction(job, "Rejected idea"), "agent", null, NOW);
  setStatus(db, dismissed, "suggested", "dismissed", { actor: "owner", now: NOW });
  const fixed = insertAction(
    db,
    ruleAction({ ruleKey: "noindex", title: "Fix noindex" }),
    "scan",
    null,
    at("2026-09-01T00:00:00Z"),
  );
  setStatus(db, fixed, "open", "done", { actor: "scan", now: at("2026-10-02T06:00:00Z") });
  const old = insertAction(
    db,
    ruleAction({ ruleKey: "no-llms-txt", title: "Old fix" }),
    "scan",
    null,
    at("2026-09-01T00:00:00Z"),
  );
  setStatus(db, old, "open", "done", { actor: "scan", now: at("2026-09-20T06:00:00Z") });
  insertAction(db, ruleAction({ productId: "ghost" }), "scan", null, NOW);
  return { openId };
}

const build = (db: ReturnType<typeof openTestDb>, products = [acme, beta, quiet]) =>
  buildWeeklyExport(db, { products, week: "2026-W40", now: NOW, timeZone: TZ });

describe("buildWeeklyExport", () => {
  it("describes the week and its window in local dates", () => {
    const data = build(openTestDb());
    expect(data).toMatchObject({
      week: "2026-W40",
      generatedAt: "2026-10-04T19:00:00.000Z",
      timeZone: TZ,
      window: { from: "2026-09-27", to: "2026-10-04" },
      truncated: [],
    });
  });

  it("lists good scans in the window, oldest first, with deltas against the baseline", () => {
    const product = build(fixture()).products[0];
    expect(product?.scores).toEqual([
      {
        date: "2026-09-29",
        seo: 45,
        geo: 35,
        aeo: 20,
        complete: { seo: true, geo: true, aeo: true },
      },
      {
        date: "2026-10-03",
        seo: 50,
        geo: null,
        aeo: 25,
        complete: { seo: true, geo: false, aeo: true },
      },
    ]);
    // Baseline is the 25 September scan; its AEO was a gap and the latest GEO is one.
    expect(product?.deltas).toEqual({ seo: 10, geo: null, aeo: null });
  });

  it("has null deltas with nothing to compare, and empty lists for a product never scanned", () => {
    const [, b, q] = build(fixture()).products;
    expect(b?.deltas).toEqual({ seo: null, geo: null, aeo: null });
    expect(b?.scores).toHaveLength(1);
    expect(q).toEqual({
      id: "quiet-blog",
      name: "Quiet Blog",
      url: "https://blog.example.com",
      scores: [],
      deltas: { seo: null, geo: null, aeo: null },
      subScores: [],
      issues: [],
      collectors: [],
      searchConsole: null,
      competitors: [],
    });
  });

  it("takes sub-scores, issues, collectors and Search Console from the latest scored scan", () => {
    const product = build(fixture()).products[0];
    expect(product?.subScores).toEqual([
      { key: "seo.titles", label: "Titles", score: 80, status: "ok", evidence: "4 of 5 pages" },
      {
        key: "geo.llms",
        label: "llms.txt",
        score: null,
        status: "missing",
        evidence: "not checked",
      },
    ]);
    const statuses = { ...ALL_OK, pagespeed: "failed" as const };
    const expected = deriveIssues(
      ACME_SCAN.filter((o) => o.collector !== "pagespeed"),
      statuses,
    );
    expect(product?.issues.map((i) => i.id)).toEqual(expected.map((i) => i.id));
    expect(product?.issues.length).toBeGreaterThan(0);
    for (const issue of product?.issues ?? []) expect(issue.examples.length).toBeLessThanOrEqual(5);
    expect(product?.collectors.map((c) => [c.collector, c.status])).toEqual([
      ["crawler", "ok"],
      ["readiness", "ok"],
      ["pagespeed", "failed"],
      ["search-console", "ok"],
    ]);
    expect(product?.searchConsole).toEqual({
      clicks: 280,
      impressions: 1652,
      priorImpressions: 1400,
    });
  });

  it("never puts account emails or file paths from collector errors in the export", () => {
    const error = build(fixture()).products[0]?.collectors[2]?.error ?? "";
    expect(error).toBe("Quota for [email]; see [path]");
    expect(JSON.stringify(build(fixture()))).not.toMatch(/gserviceaccount|\/srv\//);
    expect(scrub("token at https://user:secret@example.com/x")).toBe(
      "token at https://***@example.com/x",
    );
  });

  it("scrubs secrets from issue examples", () => {
    const db = openTestDb();
    const page = htmlPage("/p?token=abc123", { titleLength: 0, title: "" });
    const { collector: _, ...observation } = page;
    const { collector: __, ...site } = crawlSite({ brokenInternalLinks: [] });
    seedScan(db, {
      productId: "acme-docs",
      at: at("2026-10-03T06:00:00Z"),
      runs: [{ collector: "crawler", status: "ok", observations: [observation, site] }],
    });
    const issue = build(db, [acme]).products[0]?.issues.find((i) => i.id === "missing-title");
    expect(issue?.examples).toEqual(["https://docs.example.com/p?token=[redacted]"]);
  });

  it("lists the owner's active and suggested actions and what was resolved this week", () => {
    const db = fixture();
    const { openId } = seedActions(db);
    const data = build(db);
    expect(data.actions).toEqual([
      {
        id: openId,
        productId: "acme-docs",
        area: "SEO",
        title: "Add meta descriptions",
        impact: "high",
        status: "open",
        source: "rule",
        ageDays: 3,
      },
      expect.objectContaining({
        title: "Answer buyer questions",
        status: "suggested",
        source: "agent",
        ageDays: 0,
      }),
    ]);
    expect(data.resolvedThisWeek).toEqual([
      { productId: "acme-docs", title: "Fix noindex", at: "2026-10-02T06:00:00.000Z" },
    ]);
  });

  it("lists approved and proposed competitors, never rejected ones", () => {
    const db = openTestDb();
    importProposals(
      db,
      "acme-docs",
      {
        keywords: [],
        questions: [],
        competitors: [
          { name: "Example Rival", url: "https://rival.example.com", why: "Ranks" },
          { name: "Other Rival", url: "https://other.example.com", why: "Cited" },
          { name: "Not A Rival", url: "https://no.example.com", why: "Wrong" },
        ],
      },
      null,
    );
    const [rival, , not] = listProposals(db, "acme-docs").competitor;
    decideProposal(db, "acme-docs", rival?.id ?? 0, "approved");
    decideProposal(db, "acme-docs", not?.id ?? 0, "rejected");
    expect(build(db, [acme]).products[0]?.competitors).toEqual([
      { name: "Example Rival", url: "https://rival.example.com", status: "approved" },
      { name: "Other Rival", url: "https://other.example.com", status: "proposed" },
    ]);
  });

  it("ignores products that are not configured", () => {
    const db = fixture();
    seedActions(db);
    const data = build(db, [acme]);
    expect(data.products.map((p) => p.id)).toEqual(["acme-docs"]);
    expect(data.actions.every((a) => a.productId === "acme-docs")).toBe(true);
  });
});
