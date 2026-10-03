import { z } from "zod";
import { stripInvisible } from "@/lib/text/hidden-chars";
import { forTerminal } from "@/lib/text/terminal";
import { parseJson } from "./google-api";

// What Google's URL Inspection says about one page, reduced to the fields Harbour stores and
// the small fixed set of states its own logic uses. Google's text is untrusted: cleaned, capped.

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

const MAX_TEXT = 200;
const MAX_URL = 2_000;
const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const httpUrl = z.string().refine((value) => /^https?:$/.test(URL.parse(value)?.protocol ?? ""));

/** One inspected page as stored (observation `index_status`; subject: the page URL). */
export const indexStatusValue = z.object({
  state: z.enum(INDEX_STATES),
  /** Google's words, as given (cleaned and capped); null when the page could not be checked. */
  verdict: z.string().max(MAX_TEXT).nullable(),
  coverageState: z.string().max(MAX_TEXT).nullable(),
  lastCrawlTime: isoTime.nullable(),
  googleCanonical: httpUrl.max(MAX_URL).nullable(),
  robotsTxtState: z.string().max(MAX_TEXT).nullable(),
  pageFetchState: z.string().max(MAX_TEXT).nullable(),
  checkedAt: isoTime,
});
export type IndexStatus = z.infer<typeof indexStatusValue>;

const clean = (text: string): string =>
  forTerminal(stripInvisible(text)).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
const optionalText = z
  .string()
  .optional()
  .transform((text) => (text === undefined ? null : clean(text)) || null);

const inspection = z.object({
  inspectionResult: z.object({
    indexStatusResult: z.object({
      verdict: z.string(),
      coverageState: z.string(),
      robotsTxtState: optionalText,
      indexingState: z.string().optional(),
      pageFetchState: optionalText,
      lastCrawlTime: z.string().optional(),
      googleCanonical: z.string().optional(),
    }),
  }),
});

const BLOCKED_INDEXING = new Set([
  "BLOCKED_BY_META_TAG",
  "BLOCKED_BY_HTTP_HEADER",
  "BLOCKED_BY_ROBOTS_TXT",
]);

function stateOf(input: {
  verdict: string;
  coverage: string;
  robotsTxtState: string | null;
  indexingState: string | undefined;
}): IndexState {
  const coverage = input.coverage.toLowerCase();
  if (input.verdict === "PASS" || /^(submitted and )?indexed/.test(coverage)) return "indexed";
  const blocked =
    input.robotsTxtState === "DISALLOWED" ||
    BLOCKED_INDEXING.has(input.indexingState ?? "") ||
    /\bblocked\b|noindex/.test(coverage);
  if (blocked) return "blocked";
  if (coverage.startsWith("discovered")) return "discovered_not_indexed";
  if (coverage.startsWith("crawled")) return "crawled_not_indexed";
  if (coverage.includes("unknown to google")) return "unknown_to_google";
  return "other";
}

/** A well-formed time as ISO 8601, else null. */
const isoOrNull = (value: string | undefined): string | null => {
  const ms = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/** The stored status for a URL Inspection answer body; null when it is not one. */
export function readInspection(body: string, checkedAt: string): IndexStatus | null {
  const parsed = inspection.safeParse(parseJson(body));
  if (!parsed.success) return null;
  const result = parsed.data.inspectionResult.indexStatusResult;
  const verdict = clean(result.verdict);
  const coverageState = clean(result.coverageState);
  if (!verdict || !coverageState) return null;
  const canonical = httpUrl.max(MAX_URL).safeParse(result.googleCanonical);
  return {
    state: stateOf({
      verdict,
      coverage: coverageState,
      robotsTxtState: result.robotsTxtState,
      indexingState: result.indexingState,
    }),
    verdict,
    coverageState,
    lastCrawlTime: isoOrNull(result.lastCrawlTime),
    googleCanonical: canonical.success ? canonical.data : null,
    robotsTxtState: result.robotsTxtState,
    pageFetchState: result.pageFetchState,
    checkedAt,
  };
}

/** A page that could not be checked this time: a gap, never a state Harbour guesses. */
export function unknownStatus(checkedAt: string): IndexStatus {
  return {
    state: "unknown",
    verdict: null,
    coverageState: null,
    lastCrawlTime: null,
    googleCanonical: null,
    robotsTxtState: null,
    pageFetchState: null,
    checkedAt,
  };
}
