import { desc, like } from "drizzle-orm";
import { brainHref } from "@/lib/brain/wikilinks";
import type { Db } from "@/lib/db/client";
import { brainDocs } from "@/lib/db/schema";
import { formatWeekdayTime } from "@/lib/format/date";
import { nextWeeklyRun } from "./schedule";
import { isWeekLabel } from "./week";

const REPORT_DIR = "reports/weekly/";

export type WeeklyPanelSettings = {
  timeZone: string;
  locale: string;
  /** HARBOUR_SCHEDULED_ANALYST is on. */
  enabled: boolean;
  tokenSet: boolean;
};

export type WeeklyPanelView = {
  /** When the schedule next queues a run, formatted; null when scheduled runs are off. */
  nextRun: string | null;
  latestReport: { week: string; href: string } | null;
  tokenSet: boolean;
};

/** The newest indexed weekly report, by its week label (labels sort by date). */
function latestReport(db: Db): WeeklyPanelView["latestReport"] {
  const rows = db
    .select({ path: brainDocs.path })
    .from(brainDocs)
    .where(like(brainDocs.path, `${REPORT_DIR}%.md`))
    .orderBy(desc(brainDocs.path))
    .all();
  for (const { path } of rows) {
    const week = path.slice(REPORT_DIR.length, -".md".length);
    if (isWeekLabel(week)) return { week, href: brainHref(path) };
  }
  return null;
}

/** What the Agents page shows about the weekly analyst report. */
export function weeklyPanelView(db: Db, settings: WeeklyPanelSettings, now: Date): WeeklyPanelView {
  const { timeZone, locale, enabled, tokenSet } = settings;
  const next = nextWeeklyRun(now, timeZone, enabled);
  return {
    nextRun: next ? formatWeekdayTime(next, timeZone, locale) : null,
    latestReport: latestReport(db),
    tokenSet,
  };
}
