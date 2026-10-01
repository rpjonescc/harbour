import { formatWeekdayTime } from "@/lib/format/date";
import { localTime } from "@/lib/format/zoned-time";
import { nextMonthlyRefresh } from "./refresh-schedule";
import { isFutureDate, staleTopics, topicAges } from "./research-age";
import { RESEARCH_TOPICS } from "./topics";

export type RefreshPanelSettings = {
  root: string;
  timeZone: string;
  locale: string;
  /** HARBOUR_SCHEDULED_RESEARCH is on. */
  enabled: boolean;
  tokenSet: boolean;
};

export type RefreshPanelView = {
  /** One line on the schedule: off, needs a token, or the next scheduled refresh. */
  schedule: string;
  /** How many research documents there are in all. */
  total: number;
  /** Documents due for a refresh, oldest first: "researched 10 Jan", "date unknown" or "date in the future". */
  due: { title: string; age: string }[];
  /** Research documents not written yet (the research sprint writes them, not a refresh). */
  missing: number;
  tokenSet: boolean;
};

/** "researched 10 Jan", with the year when it is not this year's. */
function describeAge(researched: string | null, today: string, locale: string): string {
  if (researched === null) return "date unknown";
  if (isFutureDate(researched, today)) return "date in the future";
  const sameYear = researched.slice(0, 4) === today.slice(0, 4);
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC", // a calendar date: no zone may move it a day
  }).format(new Date(`${researched}T00:00:00Z`));
  return `researched ${date}`;
}

function scheduleLine(settings: RefreshPanelSettings, now: Date): string {
  const next = nextMonthlyRefresh(now, settings.timeZone, settings.enabled);
  if (!next) return "Scheduled refresh is off";
  if (!settings.tokenSet) return "Scheduled refresh needs a Claude token";
  return `Next scheduled refresh: ${formatWeekdayTime(next, settings.timeZone, settings.locale)}`;
}

/** What the Agents page shows about the research refresh. */
export function refreshPanelView(settings: RefreshPanelSettings, now: Date): RefreshPanelView {
  const today = localTime(settings.timeZone, now).day;
  const ages = topicAges(settings.root);
  return {
    schedule: scheduleLine(settings, now),
    total: RESEARCH_TOPICS.length,
    due: staleTopics(ages, today).map((age) => ({
      title: age.title,
      age: describeAge(age.researched, today, settings.locale),
    })),
    missing: ages.filter((age) => !age.exists).length,
    tokenSet: settings.tokenSet,
  };
}
