import type { Briefing } from "@/lib/explain/briefing";
import { formatDateTime, formatLongDate } from "@/lib/format/date";
import { BriefingText } from "./BriefingText";

type Props = {
  now: Date;
  timeZone: string;
  locale: string;
  scannedAt: Date | null;
  scanning: boolean;
  lastFailedAt: Date | null;
  briefing: Briefing;
  isSample: boolean;
};

/** When the sites were last checked, in plain words. */
function checkStatus({ scanning, scannedAt, lastFailedAt, timeZone, locale }: Props): string {
  if (scanning) return "checking your sites now";
  if (scannedAt) return `last checked ${formatDateTime(scannedAt, timeZone, locale)}`;
  if (lastFailedAt) {
    return `the last check didn't finish (${formatDateTime(lastFailedAt, timeZone, locale)})`;
  }
  return "not checked yet";
}

/** The date, when the sites were last checked, and the briefing. */
export function TodayHeader(props: Props) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-sm text-ink-muted">
        {formatLongDate(props.now, props.timeZone, props.locale)} · {checkStatus(props)}
      </p>
      <BriefingText briefing={props.briefing} isSample={props.isSample} />
    </header>
  );
}
