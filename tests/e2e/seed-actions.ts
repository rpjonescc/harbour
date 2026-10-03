// Seeds the Actions board for actions.spec.ts through production code: a finished scan of the
// fictional Lighthouse Café whose rule sync opens its rule actions, and two actions the weekly
// analyst suggested. Run from the spec (not global setup), so earlier projects still see the
// sample Today.
import { eq } from "drizzle-orm";
import { syncRuleActions } from "@/lib/actions/rule-sync-store";
import { importWeeklyActions } from "@/lib/analyst/proposals";
import { isoWeekLabel } from "@/lib/analyst/week";
import { type Db, migrateDb, openDb } from "@/lib/db/client";
import { jobs, scanRuns } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { evaluateRules } from "@/lib/scan/issues";
import { scoreScan } from "@/lib/scan/score";
import {
  finishScan,
  recordCollectorRun,
  scanObservations,
  scoreContext,
  startScan,
  storeScores,
} from "@/lib/scan/store";
import type { CollectorStatus, Observation, ScanObservation } from "@/lib/scan/types";
import { crawlSite, htmlPage, ORIGIN, readiness } from "@/tests/helpers/scoring";
import { E2E_DB } from "../../playwright.config";

export const CAFE = { id: "lighthouse-cafe", name: "Lighthouse Café", kind: "product" as const };
const CAFE_URL = "https://lighthouse-cafe.example.com";

/** The two analyst suggestions the specs find by title. */
export const SUGGESTED = {
  geo: "Name the café in the first sentence of the home page",
  aeo: "Answer opening-hours questions in one line",
} as const;
export const GEO_EVIDENCE = "The home page opens with a slogan, not the café's name";

/** Scoring fixtures moved from the Acme Docs origin to the café's own. */
const atCafe = (o: ScanObservation): ScanObservation =>
  JSON.parse(JSON.stringify(o).replaceAll(ORIGIN, CAFE_URL));

// The café's home page has no meta description, its menu page tells Google not to quote it, and
// its robots.txt blocks PerplexityBot (an AI search agent) and GPTBot (training only, which
// raises nothing). It has no llms.txt and no FAQ markup, which raise nothing either since
// formula v3.
const CRAWL = [
  htmlPage("/", { descriptionLength: 0 }),
  htmlPage("/menu", { noSnippet: true }),
  crawlSite({ brokenInternalLinks: [] }),
].map(atCafe);
const READINESS = [
  readiness({
    robotsTxt: {
      state: "ok",
      valid: true,
      googlebot: "allowed",
      aiCrawlerAccess: { GPTBot: "blocked", PerplexityBot: "blocked", "OAI-SearchBot": "allowed" },
    },
    llmsTxt: { present: false, status: 404, bytes: null, truncated: false, error: null },
    schema: {
      pagesChecked: 3,
      pagesWith: {
        Organization: 1,
        WebSite: 1,
        LocalBusiness: 1,
        FAQPage: 0,
        HowTo: 0,
        Article: 0,
      },
    },
  }),
].map(atCafe);

const strip = ({ collector: _, ...observation }: ScanObservation): Observation => observation;

function finishedJob(
  db: Db,
  kind: "scan" | "weekly-analyst",
  params: Record<string, string>,
  at: Date,
) {
  // Finished on insert: the worker only claims queued jobs.
  return db
    .insert(jobs)
    .values({
      kind,
      params,
      dedupeKey: `e2e-seed:${kind}`,
      status: "ok",
      requestedBy: null,
      createdAt: at,
      startedAt: at,
      finishedAt: at,
    })
    .returning({ id: jobs.id })
    .get().id;
}

function seedScan(db: Db, now: Date) {
  const scanId = startScan(db, CAFE.id, finishedJob(db, "scan", { productId: CAFE.id }, now), now);
  const statuses: Record<string, CollectorStatus> = {
    crawler: "ok",
    readiness: "ok",
    pagespeed: "not_configured",
    "search-console": "not_configured",
  };
  const run = (collector: string, status: CollectorStatus, found: ScanObservation[] = []) =>
    recordCollectorRun(db, {
      scanId,
      collector,
      status,
      error: status === "ok" ? null : "Not connected (E2E)",
      startedAt: now,
      finishedAt: now,
      observations: status === "ok" ? found.map(strip) : undefined,
    });
  run("crawler", "ok", CRAWL);
  run("readiness", "ok", READINESS);
  run("pagespeed", "not_configured");
  run("search-console", "not_configured");
  finishScan(db, scanId, "ok", now);
  const observations = scanObservations(db, scanId);
  const scores = scoreScan(observations, statuses, scoreContext(db, CAFE, statuses, now));
  if (scores) storeScores(db, scanId, CAFE.id, scores, now);
  syncRuleActions(db, {
    productId: CAFE.id,
    outcomes: evaluateRules(observations, statuses, "product"),
    scanDate: isoDateIn("UTC", now),
    now,
  });
}

function seedSuggestions(db: Db, now: Date) {
  const week = isoWeekLabel(isoDateIn("UTC", now));
  const jobId = finishedJob(db, "weekly-analyst", { week }, now);
  const action = {
    productId: CAFE.id,
    effort: "small" as const,
    docs: [],
  };
  importWeeklyActions(
    db,
    {
      actions: [
        {
          ...action,
          area: "GEO",
          impact: "high",
          title: SUGGESTED.geo,
          why: "AI assistants quote pages that say plainly who they are about.",
          fix: "Open the home page with one sentence naming the café and where it is.",
          check: "The home page's first sentence names Lighthouse Café.",
          evidence: [{ url: `${CAFE_URL}/`, note: GEO_EVIDENCE }],
        },
        {
          ...action,
          area: "AEO",
          impact: "low",
          title: SUGGESTED.aeo,
          why: "Answer engines lift short answers to common questions.",
          fix: "Add a one-line answer with the opening hours near the top of the page.",
          check: "A page answers “When is the café open?” in one line.",
          evidence: [{ note: "Opening hours appear only in an image" }],
        },
      ],
    },
    jobId,
    now,
  );
}

/** Seeds once: a rerun (another worker, a retry) finds the café's scan and does nothing. */
export function seedActions(): void {
  const db = openDb(E2E_DB);
  migrateDb(db);
  const seeded = db.select().from(scanRuns).where(eq(scanRuns.productId, CAFE.id)).get();
  if (seeded) return;
  const now = new Date();
  seedScan(db, now);
  seedSuggestions(db, now);
}
