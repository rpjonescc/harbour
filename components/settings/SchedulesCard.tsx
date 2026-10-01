import { Tag } from "@/components/ui/Tag";
import { formatWeekdayTime } from "@/lib/format/date";
import type { ScheduleRow } from "@/lib/settings/view";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const CELL = "py-2 pr-3";

/** What the worker queues by itself, when, and how each schedule is switched off. */
export function SchedulesCard({
  schedules,
  timeZone,
  locale,
  section,
}: {
  section?: SectionPlacement;
  schedules: ScheduleRow[];
  timeZone: string;
  locale: string;
}) {
  return (
    <SettingsSection {...section} title="Schedules">
      <p className="text-xs text-ink-muted">All times are in {timeZone}.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">What runs on a schedule and when it runs next</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className={`${CELL} font-normal`}>
                Schedule
              </th>
              <th scope="col" className={`${CELL} font-normal`}>
                When
              </th>
              <th scope="col" className={`${CELL} font-normal`}>
                Status
              </th>
              <th scope="col" className="py-2 font-normal">
                Next run
              </th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <th scope="row" className={`${CELL} font-medium`}>
                  {row.label}
                </th>
                <td className={`${CELL} text-ink-muted`}>{row.when}</td>
                <td className={CELL}>
                  <Tag tone={row.enabled ? "accent" : "neutral"}>{row.enabled ? "On" : "Off"}</Tag>
                </td>
                <td className="py-2">
                  {row.next ? (
                    formatWeekdayTime(row.next, timeZone, locale)
                  ) : (
                    <span className="text-ink-muted">
                      Off — <code className="font-mono text-xs">{row.setting}=off</code>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
