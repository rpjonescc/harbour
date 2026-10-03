import { z } from "zod";

// How an inspected page and a run are stored (observations `index_status` and `index_summary`).
// Pure shapes with no network code, so the web side can read them.

/** What Harbour concludes from Google's words; "unknown" means the page could not be checked. */
export const INDEX_STATES = [
  "indexed",
  "discovered_not_indexed",
  "crawled_not_indexed",
  "unknown_to_google",
  "blocked",
  "other",
  "unknown",
] as const;
export type IndexState = (typeof INDEX_STATES)[number];

/** The states that mean "Google has not added this page" (what the rule counts). */
export const NOT_INDEXED_STATES: readonly IndexState[] = [
  "discovered_not_indexed",
  "crawled_not_indexed",
  "unknown_to_google",
];

export const MAX_TEXT = 200;
export const MAX_URL = 2_000;
const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
export const httpUrl = z
  .string()
  .refine((value) => /^https?:$/.test(URL.parse(value)?.protocol ?? ""));

/** One inspected page as stored (observation `index_status`; subject: the page URL). */
export const indexStatusValue = z
  .object({
    state: z.enum(INDEX_STATES),
    /** Google's words, as given (cleaned and capped); null when the page could not be checked. */
    verdict: z.string().max(MAX_TEXT).nullable(),
    coverageState: z.string().max(MAX_TEXT).nullable(),
    lastCrawlTime: isoTime.nullable(),
    googleCanonical: httpUrl.max(MAX_URL).nullable(),
    robotsTxtState: z.string().max(MAX_TEXT).nullable(),
    pageFetchState: z.string().max(MAX_TEXT).nullable(),
    checkedAt: isoTime,
    /** Checks of this page that failed since its last good one; absent when none. */
    failures: z.number().int().positive().optional(),
    /** When the last failed check was made; present exactly when `failures` is. */
    attemptedAt: isoTime.optional(),
  })
  .refine((value) => (value.failures === undefined) === (value.attemptedAt === undefined), {
    message: "failures and attemptedAt go together",
  });
export type IndexStatus = z.infer<typeof indexStatusValue>;

const stoppedBy = z.enum(["quota", "time", "errors"]).nullable();
/** Why a run ended before every chosen page was asked about; null when it did not. */
export type StoppedBy = z.infer<typeof stoppedBy>;

/** One run's report (observation `index_summary`; subject: the property). */
export const indexSummaryValue = z.object({
  /** Pages with a known status, from this run or carried over. */
  inspected: z.number().int().nonnegative(),
  /** Pages in the sitemap. */
  total: z.number().int().nonnegative(),
  byState: z.record(z.enum(INDEX_STATES), z.number().int().nonnegative()),
  /** The oldest check behind any known status; null if there is none. */
  checkedThrough: isoTime.nullable(),
  /** Pages asked about in this run. */
  checkedThisRun: z.number().int().nonnegative(),
  stoppedBy,
  /** When Harbour first saw this sitemap's pages, for the rule's "give new pages time" gate. */
  sitemapSeenSince: isoTime,
});
export type IndexSummary = z.infer<typeof indexSummaryValue>;
