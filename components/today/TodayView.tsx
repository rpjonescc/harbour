import { RefreshWhileScanning } from "@/components/products/RefreshWhileScanning";
import type { CostMeterView } from "@/lib/costs/meter-view";
import type { NoteSlot } from "@/lib/note/view";
import type { BackupStatus } from "@/lib/ops/backup-status";
import type { TodaySummary } from "@/lib/today/types";
import type { WorkStrip as WorkStripData } from "@/lib/today/work-strip";
import { BackupNotice } from "./BackupNotice";
import { CostMeter } from "./CostMeter";
import { NextUp } from "./NextUp";
import { NoteCard } from "./note/NoteCard";
import { SampleBanner } from "./SampleBanner";
import { ScoresSection } from "./ScoresSection";
import { SourceFailures } from "./SourceFailures";
import { TodayHeader } from "./TodayHeader";
import { WorkStrip } from "./WorkStrip";

/**
 * Today: the briefing, a verdict per product and area, what's worth doing next, and the
 * housekeeping notices (paid spend, backups, data sources) behind the scenes.
 */
export function TodayView({
  today,
  note,
  workStrip,
  costMeter,
  backup,
  now,
  timeZone,
  locale,
}: {
  today: TodaySummary;
  /** The note card's content; null when the personality is quiet. */
  note: NoteSlot | null;
  /** Where the work is on the actions board; real even on the sample Today. */
  workStrip: WorkStripData;
  /** Real spend even on the sample Today: the ledger is never sample data. */
  costMeter: CostMeterView;
  /** Real backup health even on the sample Today: shown only when it needs a look. */
  backup: Pick<BackupStatus, "health" | "lastFailure" | "enabled" | "next" | "latest" | "count">;
  now: Date;
  timeZone: string;
  locale: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <RefreshWhileScanning active={today.scanning} />
      {note && <NoteCard slot={note} timeZone={timeZone} locale={locale} />}
      <TodayHeader
        now={now}
        timeZone={timeZone}
        locale={locale}
        scannedAt={today.scannedAt}
        scanning={today.scanning}
        lastFailedAt={today.lastFailedAt}
        briefing={today.briefing}
        isSample={today.isSample}
      />
      {today.isSample && <SampleBanner />}
      <WorkStrip strip={workStrip} />
      <ScoresSection scores={today.scores} />
      <NextUp actions={today.actions} more={today.moreActions} />
      <section aria-labelledby="behind-heading" className="flex flex-col gap-3">
        <h2 id="behind-heading" className="font-serif text-xl">
          Behind the scenes
        </h2>
        <CostMeter view={costMeter} now={now} timeZone={timeZone} locale={locale} />
        <BackupNotice backup={backup} timeZone={timeZone} locale={locale} />
        <SourceFailures failures={today.failures} />
      </section>
    </div>
  );
}
