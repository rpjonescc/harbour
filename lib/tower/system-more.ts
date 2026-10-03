// The Schedules, Agents and Spend lights (split from system.ts to keep each module small). Pure.

import type { Named } from "@/lib/agents/view";
import { formatAud } from "@/lib/costs/budget";
import type { CostMeterView } from "@/lib/costs/meter-view";
import { jobWords } from "@/lib/explain/job-words";
import { budgetReachedLine, NO_BUDGET, NO_PAID_DATA, spendOfBudget } from "@/lib/explain/spend";
import type { LightTone } from "@/lib/explain/tower";
import { agoPhrase } from "@/lib/explain/tower";
import { AGENTS_SENTENCE, SCHEDULE_SENTENCE, SPEND_SENTENCE } from "@/lib/explain/tower-lights";
import { monthWindow } from "@/lib/format/zoned-time";
import type { ScheduleRow } from "@/lib/settings/view";
import { FRESHNESS_RULES, type FreshnessRule, freshness } from "./freshness";
import type { Words } from "./system";
import type { ScheduleFact, SystemFacts } from "./system-data";

type Shaped = { tone: LightTone; sentence: string };

/** How often each schedule should run, for the freshness rule. */
const SCHEDULE_RULE: Readonly<Record<ScheduleRow["id"], FreshnessRule>> = {
  scan: FRESHNESS_RULES.dailyCheck,
  backup: FRESHNESS_RULES.backup,
  note: FRESHNESS_RULES.dailyNote,
  digest: FRESHNESS_RULES.dailyNote,
  analyst: FRESHNESS_RULES.weeklyRun,
  ideas: FRESHNESS_RULES.weeklyRun,
  refresh: FRESHNESS_RULES.monthlyRefresh,
};

/** A schedule that did not run on time, or null when it did. */
function scheduleTrouble({ row, lastRun }: ScheduleFact, words: Words): Shaped | null {
  if (lastRun === null) return { tone: "unknown", sentence: SCHEDULE_SENTENCE.never(row.label) };
  const ago = agoPhrase(lastRun.at, words.now, words.timeZone, words.locale);
  if (lastRun.status === "failed") {
    return { tone: "watch", sentence: SCHEDULE_SENTENCE.failed(row.label, ago) };
  }
  if (freshness(lastRun.at, words.now, SCHEDULE_RULE[row.id]) === "fresh") return null;
  return { tone: "watch", sentence: SCHEDULE_SENTENCE.late(row.label, ago) };
}

/** Fine when every schedule that is on last ran on time and finished; off when none is on. */
export function scheduleLight(schedules: readonly ScheduleFact[], words: Words): Shaped {
  const on = schedules.filter((s) => s.row.enabled);
  if (on.length === 0) return { tone: "off", sentence: SCHEDULE_SENTENCE.allOff };
  const trouble = on.flatMap((s) => scheduleTrouble(s, words) ?? []);
  // A run that went wrong speaks before one that has not happened yet.
  const [first] = [...trouble].sort((a, b) =>
    a.tone === b.tone ? 0 : a.tone === "watch" ? -1 : 1,
  );
  if (first === undefined) return { tone: "ok", sentence: SCHEDULE_SENTENCE.allRan(on.length) };
  const sentence =
    trouble.length === 1
      ? first.sentence
      : SCHEDULE_SENTENCE.several(trouble.length, first.sentence);
  return { tone: first.tone, sentence };
}

/** Fine when no agent run failed in 24 h without a later success; busy while one runs. */
export function agentsLight(agents: SystemFacts["agents"], products: readonly Named[]): Shaped {
  const doing = (job: (typeof agents.running)[number]) => jobWords(job, products).doing;
  if (agents.failedUnretried.length > 0) {
    return { tone: "watch", sentence: AGENTS_SENTENCE.failed(agents.failedUnretried.map(doing)) };
  }
  const [running] = agents.running;
  if (running !== undefined) {
    return {
      tone: "busy",
      sentence: AGENTS_SENTENCE.running(doing(running), agents.queued.length),
    };
  }
  if (agents.queued.length > 0) {
    return { tone: "busy", sentence: AGENTS_SENTENCE.waiting(agents.queued.length) };
  }
  return { tone: "ok", sentence: AGENTS_SENTENCE.idle(agents.finishedToday) };
}

/** Fine below 80% of the budget (or with no paid data); a look at 80%; the owner's when reached. */
export function spendLight(cost: CostMeterView, words: Words): Shaped {
  if (cost.state === "no-paid-sources") return { tone: "ok", sentence: NO_PAID_DATA };
  if (cost.state === "no-budget") return { tone: "ok", sentence: `${NO_BUDGET}.` };
  if (cost.state === "reached") {
    const until = new Intl.DateTimeFormat(words.locale, {
      timeZone: words.timeZone,
      day: "numeric",
      month: "short",
    }).format(monthWindow(words.now, words.timeZone).end);
    return { tone: "act", sentence: budgetReachedLine(until) };
  }
  if (cost.state === "warn") {
    const percent = Math.floor((cost.spentMicro / cost.capMicro) * 100);
    return { tone: "watch", sentence: SPEND_SENTENCE.nearBudget(percent) };
  }
  const aud = (micro: number) => formatAud(micro, words.locale);
  return {
    tone: "ok",
    sentence: SPEND_SENTENCE.thisMonth(spendOfBudget(aud(cost.spentMicro), aud(cost.capMicro))),
  };
}
