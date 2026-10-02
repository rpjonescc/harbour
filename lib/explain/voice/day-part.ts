import type { LocalMoment, Weekday } from "@/lib/format/zoned-time";

export type DayPart = "morning" | "afternoon" | "evening" | "night";
export type Rest = "weekend" | "out-of-hours";

const WEEKEND = new Set<Weekday>(["Saturday", "Sunday"]);
// 20:00 to 04:59 is out of hours. The default 06:30 note is a working-morning slot.
const OUT_OF_HOURS_FROM = 20;
const OUT_OF_HOURS_UNTIL = 5;

/** The word for the hour of the day, for the agent's greeting. */
export function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Whether the moment suggests rest: the weekend (which wins) or out of hours; else null. */
export function restOf({ weekday, hour }: Omit<LocalMoment, "day">): Rest | null {
  if (WEEKEND.has(weekday)) return "weekend";
  return hour >= OUT_OF_HOURS_FROM || hour < OUT_OF_HOURS_UNTIL ? "out-of-hours" : null;
}
