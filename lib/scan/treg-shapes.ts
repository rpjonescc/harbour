import { z } from "zod";
import { hasControlChars, hasInvisible } from "@/lib/text/hidden-chars";
import { httpUrl, isoTime, MAX_URL } from "./index-shapes";

// How the outside-view checks are stored (observations `backlinks`, `serp_rank`, `ai_answer` and
// `treg_summary`). Pure shapes with no network code, so the web side can read them with
// safeParse. The AI answer's text is never stored: only the verdicts derived from it.

export const TREG_CHECKS = ["backlinks", "serp_rank", "ai_answer"] as const;
export type TregCheck = (typeof TREG_CHECKS)[number];

/** Furthest down the results the search position looks. */
export const SERP_DEPTH = 30;
export const MAX_TREG_TEXT = 160;
const count = z.number().int().nonnegative().max(1e12);
/** One line of visible text: no control, zero-width or bidi characters (stored text is untrusted). */
const isPlain = (text: string) =>
  !hasInvisible(text) && !hasControlChars(text, { tab: false }) && !/[\r\n]/.test(text);
const plain = (min: number, max: number) =>
  z.string().min(min).max(max).refine(isPlain, "must be plain visible text");
/** A lowercase host name (letters, digits, dots, hyphens), never hidden or look-alike characters. */
export const host = plain(1, 100).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, "not a host name");

/** Links from other sites (observation `backlinks`; subject: the domain). */
export const backlinksValue = z.object({
  referringDomains: count,
  backlinks: count,
  dofollow: count,
  /** The provider's own domain rank; null when it gave none. */
  rank: z.number().nonnegative().max(1e12).nullable(),
  provider: plain(1, 60),
  /**
   * True when the site's own domain was taken out of the count (referringDomains and backlinks
   * are then outside sites only); false or absent (older rows) when it could not be.
   */
  ownDomainExcluded: z.boolean().optional(),
  checkedAt: isoTime,
});
export type Backlinks = z.infer<typeof backlinksValue>;

/** Where a search puts the site (observation `serp_rank`; subject: the search). */
export const serpRankValue = z.object({
  query: plain(1, MAX_TREG_TEXT),
  /** 1 to 30; null means "not found in the top 30", never 0 or 31. */
  position: z.number().int().min(1).max(SERP_DEPTH).nullable(),
  url: httpUrl.max(MAX_URL).nullable(),
  topDomains: z.array(host).max(5),
  checkedAt: isoTime,
});
export type SerpRank = z.infer<typeof serpRankValue>;

/** What an AI assistant said about the site (observation `ai_answer`; subject: the question). */
export const aiAnswerValue = z.object({
  question: plain(1, MAX_TREG_TEXT),
  named: z.boolean(),
  cited: z.boolean(),
  citedDomains: z.array(host).max(8),
  /** Businesses the answer named; null when the provider did not list them. */
  businessesNamed: count.nullable(),
  checkedAt: isoTime,
});
export type AiAnswer = z.infer<typeof aiAnswerValue>;

export const TREG_STOPPED_BY = ["done", "budget", "balance", "key", "error"] as const;
export type TregStoppedBy = (typeof TREG_STOPPED_BY)[number];

/** Why one check failed: a fixed code, never text from the provider. */
export const TREG_PROBLEMS = [
  "above_ceiling",
  "retired",
  "server",
  "timeout",
  "unreadable",
  "rejected",
  "network",
  "rows_dropped",
] as const;
export type TregProblem = (typeof TREG_PROBLEMS)[number];

/** One run's tally for a product (observation `treg_summary`; subject: the domain). */
export const tregSummaryValue = z.object({
  /** Checks a call was made for. */
  attempted: count,
  ok: count,
  failed: count,
  /** What Treg charged this run, in micro-USD (the estimate where it gave no usable figure). */
  spentMicroUsd: count,
  stoppedBy: z.enum(TREG_STOPPED_BY),
  /** Each failed check and why, at most 30. */
  problems: z
    .array(
      z.object({
        check: z.enum(TREG_CHECKS),
        subject: plain(0, MAX_TREG_TEXT),
        reason: z.enum(TREG_PROBLEMS),
      }),
    )
    .max(30),
});
export type TregSummary = z.infer<typeof tregSummaryValue>;

/** Why a run that answered something did not answer everything; null when it did. */
export const PARTIAL_RUNS = ["budget", "paused", "error", "failed"] as const;
export type PartialRun = (typeof PARTIAL_RUNS)[number];

/** How a run fell short: the budget ran out, Treg was paused, it stopped answering or checks failed. */
export function partialOf(summary: TregSummary): PartialRun | null {
  if (summary.stoppedBy === "budget") return "budget";
  if (summary.stoppedBy === "key" || summary.stoppedBy === "balance") return "paused";
  if (summary.stoppedBy === "error") return "error";
  return summary.failed > 0 ? "failed" : null;
}
