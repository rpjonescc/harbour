import { and, desc, eq, inArray, like } from "drizzle-orm";
import { brainHref } from "@/lib/brain/wikilinks";
import type { Db } from "@/lib/db/client";
import { brainDocs, jobs } from "@/lib/db/schema";
import { formatWeekdayTime } from "@/lib/format/date";
import { nextWeeklyRun, pendingWeeklySlot } from "./schedule";
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
  /** One line on the schedule: off, blocked, a run queued or running, a catch-up due, or the next run. */
  schedule: string;
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

function activeRunStatus(db: Db): string | null {
  const row = db
    .select({ status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.kind, "weekly-analyst"), inArray(jobs.status, ["queued", "running"])))
    .orderBy(desc(jobs.id))
    .get();
  return row?.status ?? null;
}

function scheduleLine(db: Db, settings: WeeklyPanelSettings, now: Date): string {
  const { timeZone, locale, enabled, tokenSet } = settings;
  const next = nextWeeklyRun(now, timeZone, enabled);
  if (!next) return "Scheduled runs are off";
  if (!tokenSet) return "Scheduled runs need a Claude token";
  const active = activeRunStatus(db);
  if (active) return `A weekly report run is ${active}`;
  const pending = pendingWeeklySlot(db, now, timeZone);
  if (pending) {
    return `Catch-up due: the worker queues the ${pending.week} report at its next check, if a product was scanned in the last 7 days`;
  }
  return `Next scheduled run: ${formatWeekdayTime(next, timeZone, locale)}`;
}

/** What the Agents page shows about the weekly analyst report. */
export function weeklyPanelView(db: Db, settings: WeeklyPanelSettings, now: Date): WeeklyPanelView {
  return {
    schedule: scheduleLine(db, settings, now),
    latestReport: latestReport(db),
    tokenSet: settings.tokenSet,
  };
}
