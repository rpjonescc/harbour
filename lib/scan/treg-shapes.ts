import { z } from "zod";
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
const host = z.string().min(1).max(100);

/** Links from other sites (observation `backlinks`; subject: the domain). */
export const backlinksValue = z.object({
  referringDomains: count,
  backlinks: count,
  dofollow: count,
  /** The provider's own domain rank; null when it gave none. */
  rank: z.number().nonnegative().max(1e12).nullable(),
  provider: z.string().min(1).max(60),
  checkedAt: isoTime,
});
export type Backlinks = z.infer<typeof backlinksValue>;

/** Where a search puts the site (observation `serp_rank`; subject: the search). */
export const serpRankValue = z.object({
  query: z.string().min(1).max(MAX_TREG_TEXT),
  /** 1 to 30; null means "not found in the top 30", never 0 or 31. */
  position: z.number().int().min(1).max(SERP_DEPTH).nullable(),
  url: httpUrl.max(MAX_URL).nullable(),
  topDomains: z.array(host).max(5),
  checkedAt: isoTime,
});
export type SerpRank = z.infer<typeof serpRankValue>;

/** What an AI assistant said about the site (observation `ai_answer`; subject: the question). */
export const aiAnswerValue = z.object({
  question: z.string().min(1).max(MAX_TREG_TEXT),
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
        subject: z.string().max(MAX_TREG_TEXT),
        reason: z.enum(TREG_PROBLEMS),
      }),
    )
    .max(30),
});
export type TregSummary = z.infer<typeof tregSummaryValue>;
