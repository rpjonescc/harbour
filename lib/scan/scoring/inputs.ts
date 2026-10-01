import { z } from "zod";
import { collectorLabel } from "../labels";
import type { CollectorStatus, Observation, ScanObservation, ScoreContext } from "../types";

/** One collector's data as scoring reads it, or why there is none (a gap, never a zero). */
export type Source<T> = { ok: true; value: T } | { ok: false; reason: string };

const access = z.enum(["allowed", "blocked", "partial"]);
const DAY_MS = 24 * 60 * 60_000;
/** A carried-over weekly PageSpeed result counts for two weeks: one missed run, not more. */
const PAGESPEED_MAX_AGE_DAYS = 14;

// Only the fields scoring reads; each mirrors the collector's own type (see the plan's notes).
const crawledPage = z.object({
  status: z.number(),
  finalUrl: z.string(),
  titleLength: z.number().nullable(),
  descriptionLength: z.number().nullable(),
  h1Count: z.number().nullable(),
  canonical: z.string().nullable(),
  noindex: z.boolean().nullable(),
  jsonLdTypes: z.array(z.string()).nullable(),
  hasFaqMarkup: z.boolean().nullable(),
  questionHeadings: z.number().nullable(),
  conciseAnswers: z.number().nullable(),
});

const crawlSite = z.object({
  brokenInternalLinks: z.array(z.object({ from: z.string(), to: z.string() })),
  sitemapPages: z.object({ crawled: z.number(), ok: z.number() }).nullable(),
});

const readiness = z.object({
  robotsTxt: z.object({
    state: z.string(),
    googlebot: access.nullable(),
    aiCrawlerAccess: z.record(z.string(), access).nullable(),
  }),
  llmsTxt: z.object({ present: z.boolean().nullable(), bytes: z.number().nullable() }),
  llmsFullTxt: z.object({ present: z.boolean().nullable() }),
  sitemap: z
    .object({
      valid: z.boolean().nullable(),
      sitemapsRead: z.number(),
      urlCount: z.number().nullable(),
      partial: z.boolean(),
      errors: z.array(
        z.object({ url: z.string(), status: z.number().optional(), kind: z.string().optional() }),
      ),
      offOrigin: z.array(z.string()),
    })
    .nullable(),
  schema: z
    .object({
      pagesChecked: z.number(),
      pagesWith: z.object({
        Organization: z.number(),
        WebSite: z.number(),
      }),
    })
    .nullable(),
  preferredSources: z
    .object({
      button: z.boolean(),
      buttonPages: z.array(z.string()),
      freshUrls: z.number(),
      freshContent: z.boolean(),
    })
    .nullable(),
});

const cwv = z.object({
  performanceScore: z.number().min(0).max(100).nullable(),
  inpMs: z.number().nonnegative().nullable(),
  fieldDataAvailable: z.boolean(),
});

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const gscDay = z.object({ date: isoDay, impressions: z.number().nonnegative() });
const gscSummary = z.object({
  startDate: isoDay,
  endDate: isoDay,
  priorStartDate: isoDay,
  priorEndDate: isoDay,
});

export type CrawledPage = z.infer<typeof crawledPage>;
export type Crawl = { pages: CrawledPage[]; site: z.infer<typeof crawlSite> };
export type Readiness = z.infer<typeof readiness>;
/** Core Web Vitals and, when carried over from an earlier scan, the date it was measured. */
export type Vitals = z.infer<typeof cwv> & { measuredOn: string | null };
/** One day's impressions (Search Console returns no row for a day without any). */
export type GscDay = z.infer<typeof gscDay>;
/** Daily impressions for the scan's 28-day window and the 28 days before, with both windows. */
export type SearchConsole = {
  window: z.infer<typeof gscSummary>;
  days: GscDay[];
  priorDays: GscDay[];
};

/** Everything the formula reads, each part available or missing with a reason. */
export type ScoringInputs = {
  crawl: Source<Crawl>;
  readiness: Source<Readiness>;
  vitals: Source<Vitals>;
  searchConsole: Source<SearchConsole>;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Why a collector's data is missing, from how it ended in this scan. */
export function unavailable(collector: string, status: CollectorStatus | undefined): string {
  const label = collectorLabel(collector);
  if (status === "not_configured") return `${label} is not connected`;
  if (status === "failed") return `${label} failed in this scan`;
  if (status === "skipped") return `${label} was skipped in this scan`;
  return `${label} did not run in this scan`;
}

function malformed(collector: string, error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue ? `${issue.path.join(".") || "value"}: ${issue.message}` : "invalid";
  return `${collectorLabel(collector)} data has an unexpected shape (${where})`;
}

function parse<T>(collector: string, schema: z.ZodType<T>, value: unknown): Source<T> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: malformed(collector, parsed.error) };
}

/** The observations one collector stored in the scan (or an earlier one), by kind. */
type Of = (kind: string) => readonly Observation[];

/** The one observation of `kind` a collector stores per scan, parsed. */
function single<T>(of: Of, collector: string, kind: string, schema: z.ZodType<T>): Source<T> {
  const found = of(kind);
  if (found.length !== 1) {
    return { ok: false, reason: `${collectorLabel(collector)} stored no single ${kind} result` };
  }
  return parse(collector, schema, found[0]?.value);
}

function readCrawl(of: Of): Source<Crawl> {
  const site = single(of, "crawler", "site", crawlSite);
  if (!site.ok) return site;
  const pages = parse(
    "crawler",
    z.array(crawledPage),
    of("page").map((o) => o.value),
  );
  return pages.ok ? { ok: true, value: { pages: pages.value, site: site.value } } : pages;
}

function readVitals(
  of: Of,
  status: CollectorStatus | undefined,
  context: ScoreContext,
): Source<Vitals> {
  if (status === "ok") return withDate(single(of, "pagespeed", "cwv", cwv), null);
  if (status !== "skipped") return { ok: false, reason: unavailable("pagespeed", status) };
  const previous = context.previousPagespeed;
  if (!previous) {
    return { ok: false, reason: "PageSpeed was skipped and has no earlier result" };
  }
  const measuredOn = isoDate(previous.finishedAt);
  if (context.now.getTime() - previous.finishedAt.getTime() > PAGESPEED_MAX_AGE_DAYS * DAY_MS) {
    const reason =
      `PageSpeed was skipped and its last result (${measuredOn}) is more than ` +
      `${PAGESPEED_MAX_AGE_DAYS} days old`;
    return { ok: false, reason };
  }
  const carried: Of = (kind) => previous.observations.filter((o) => o.kind === kind);
  return withDate(single(carried, "pagespeed", "cwv", cwv), measuredOn);
}

function withDate(source: Source<z.infer<typeof cwv>>, measuredOn: string | null): Source<Vitals> {
  return source.ok ? { ok: true, value: { ...source.value, measuredOn } } : source;
}

function readSearchConsole(of: Of): Source<SearchConsole> {
  const window = single(of, "search-console", "gsc_summary", gscSummary);
  if (!window.ok) return window;
  // The date is the observation's subject; the metrics are its value.
  const daysOf = (kind: string) =>
    parse(
      "search-console",
      z.array(gscDay),
      of(kind).map((o) => ({ ...o.value, date: o.subject })),
    );
  const days = daysOf("gsc_daily");
  if (!days.ok) return days;
  const prior = daysOf("gsc_prior_daily");
  if (!prior.ok) return prior;
  return { ok: true, value: { window: window.value, days: days.value, priorDays: prior.value } };
}

/** Reads and validates the scan's observations; a collector that did not end ok is a gap. */
export function readInputs(
  observations: readonly ScanObservation[],
  statuses: Readonly<Record<string, CollectorStatus>>,
  context: ScoreContext,
): ScoringInputs {
  const ofCollector =
    (collector: string): Of =>
    (kind) =>
      observations.filter((o) => o.collector === collector && o.kind === kind);
  const when = <T>(collector: string, read: (of: Of) => Source<T>): Source<T> =>
    statuses[collector] === "ok"
      ? read(ofCollector(collector))
      : { ok: false, reason: unavailable(collector, statuses[collector]) };
  return {
    crawl: when("crawler", readCrawl),
    readiness: when("readiness", (of) => single(of, "readiness", "readiness", readiness)),
    vitals: readVitals(ofCollector("pagespeed"), statuses.pagespeed, context),
    searchConsole: when("search-console", readSearchConsole),
  };
}
