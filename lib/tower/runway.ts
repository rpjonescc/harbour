// One runway card per product (spec §4.6). Pure: no I/O, no clock.

import { agoPhrase, type LightTone } from "@/lib/explain/tower";
import { CHECK_SENTENCE } from "@/lib/explain/tower-lights";
import {
  claudeTouchLine,
  RUNWAY_HIGHLIGHT,
  runwayContentLine,
  weekTrendPhrase,
} from "@/lib/explain/tower-runway";
import { averageScore, gapReason, type Verdict, verdictFor } from "@/lib/explain/verdict";
import { AREA_KEYS } from "@/lib/scan/views";
import { actionHref } from "@/lib/today/from-actions";
import { FRESHNESS_RULES, freshness } from "./freshness";
import type { RunwayFacts } from "./runway-data";

export type RunwayCard = {
  productId: string;
  name: string;
  verdict: Verdict;
  trend: { direction: "up" | "down" | "steady" | null; phrase: string | null };
  next: { title: string; href: string } | null;
  checked: { phrase: string; tone: LightTone };
  /** At most 3; a highlight with no data is left out. */
  highlights: string[];
  contentLine: string | null;
  claudeLine: string;
};

const WEEK_MS = 7 * 24 * 60 * 60_000;
const HIGHLIGHTS = 3;

/** The change in the average score since last week, over the areas known at both ends. */
function trendOf(weekly: RunwayFacts["weekly"]): RunwayCard["trend"] {
  const both = AREA_KEYS.flatMap((area) => weekly[area] ?? []);
  const now = averageScore(both.map((c) => c.now));
  const before = averageScore(both.map((c) => c.before));
  if (now === null || before === null) return { direction: null, phrase: null };
  const change = now - before;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "steady";
  return { direction, phrase: weekTrendPhrase(change) };
}

function checkedOf(facts: RunwayFacts, now: Date, timeZone: string, locale: string) {
  const { scanning, failedAt, scannedAt } = facts.today;
  if (scanning) return { phrase: CHECK_SENTENCE.running, tone: "busy" as const };
  if (failedAt !== null) return { phrase: CHECK_SENTENCE.failed([], true), tone: "act" as const };
  if (scannedAt === null) return { phrase: CHECK_SENTENCE.never(null), tone: "unknown" as const };
  const ago = agoPhrase(scannedAt, now, timeZone, locale);
  return freshness(scannedAt, now, FRESHNESS_RULES.dailyCheck) === "fresh"
    ? { phrase: CHECK_SENTENCE.fresh(ago), tone: "ok" as const }
    : { phrase: CHECK_SENTENCE.late(ago, null), tone: "watch" as const };
}

/** Indexing, then what AI answers and other sites say: only what has data, at most 3. */
function highlightsOf({ indexing, outside }: RunwayFacts): string[] {
  const lines = [
    indexing?.state === "counted"
      ? RUNWAY_HIGHLIGHT.inGoogle(indexing.indexed, indexing.checked)
      : null,
    outside?.ai && outside.ai.asked > 0
      ? RUNWAY_HIGHLIGHT.aiNamed(outside.ai.named, outside.ai.asked)
      : null,
    outside?.links ? RUNWAY_HIGHLIGHT.linksToYou(outside.links.count) : null,
  ];
  return lines.filter((line): line is string => line !== null).slice(0, HIGHLIGHTS);
}

/** A product's card: verdict, weekly trend, next action, last check, highlights and Claude's touch. */
export function runwayCard(
  facts: RunwayFacts,
  now: Date,
  timeZone: string,
  locale: string,
): RunwayCard {
  const { row } = facts.today;
  const scores = AREA_KEYS.flatMap((area) => row.totals[area] ?? []);
  const touched = facts.claudeTouchedAt;
  const recent = touched !== null && now.getTime() - touched.getTime() <= WEEK_MS;
  return {
    productId: facts.product.id,
    name: facts.product.name,
    verdict: verdictFor(averageScore(scores), gapReason(row)),
    trend: trendOf(facts.weekly),
    next: facts.nextAction
      ? { title: facts.nextAction.title, href: actionHref(facts.nextAction.id) }
      : null,
    checked: checkedOf(facts, now, timeZone, locale),
    highlights: highlightsOf(facts),
    contentLine: facts.content ? runwayContentLine(facts.content) : null,
    claudeLine: claudeTouchLine(recent ? agoPhrase(touched, now, timeZone, locale) : null),
  };
}
