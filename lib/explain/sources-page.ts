import type { NextDailyScan } from "@/lib/jobs/scan-schedule";
import { type PageVerdict, sentences } from "./page-verdict";
import { sourceName } from "./sources";
import type { TermLine } from "./term-line";

export const SOURCES_INTRO: TermLine = [
  "Where each score's facts come from, and whether each ",
  { term: "data-source", text: "data source" },
  " is working.",
];

/** When a product's next check is. The 06:00 time is the schedule's (README: When things run). */
export const NEXT_CHECK: Readonly<Record<NextDailyScan, string>> = {
  off: "Next check: only when you choose Check now",
  today: "Next check: today at 06:00",
  tomorrow: "Next check: tomorrow at 06:00",
  due: "Next check: starting shortly",
};

const OUTCOME = {
  ok: "all good",
  partial: "some data was missing",
  failed: "didn't finish",
} as const;

/** How a finished check ended, in words. */
export function checkOutcome(status: keyof typeof OUTCOME): string {
  return OUTCOME[status];
}

/** One product as the Sources verdict reads it. */
export type SourcesVerdictProduct = {
  name: string;
  /** A check is queued or running for it now. */
  checking: boolean;
  /** At least one check has finished for it. */
  checked: boolean;
  /** The data sources whose latest run failed. */
  failed: readonly string[];
};

const NEXT_TRY = "Harbour tries again at the next check.";

const nameList = (names: readonly string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.length} products`;

/** The Sources page's verdict: a data source in trouble first, then checks under way. */
export function sourcesVerdict(products: readonly SourcesVerdictProduct[]): PageVerdict {
  const failedIds = [...new Set(products.flatMap((p) => p.failed))];
  const checking = products.filter((p) => p.checking).map((p) => p.name);
  const unchecked = products.filter((p) => !p.checked).map((p) => p.name);
  const now = checking.length > 0 ? `Checking ${nameList(checking)} now.` : null;
  const [only] = failedIds;
  if (only !== undefined) {
    const who = failedIds.length === 1 ? sourceName(only) : `${failedIds.length} data sources`;
    return {
      tone: "watch",
      text: sentences(`${who} didn't answer at the last check.`, NEXT_TRY, now),
    };
  }
  if (unchecked.length === products.length) {
    return {
      tone: now ? "busy" : "unknown",
      text: now ?? "Nothing has been checked yet. Choose Check now on a product's page.",
    };
  }
  const notYet =
    unchecked.length > 0
      ? `${nameList(unchecked)} ${unchecked.length === 1 ? "hasn't" : "haven't"} been checked yet.`
      : null;
  return {
    tone: now ? "busy" : "ok",
    text: sentences("Every connected data source answered at the last check.", now, notYet),
  };
}
