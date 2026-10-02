import { RefreshWhileScanning } from "@/components/products/RefreshWhileScanning";
import type { CostMeterView } from "@/lib/costs/meter-view";
import type { BackupStatus } from "@/lib/ops/backup-status";
import type { TodaySummary } from "@/lib/today/types";
import { BackupNotice } from "./BackupNotice";
import { CostMeter } from "./CostMeter";
import { SampleBanner } from "./SampleBanner";
import { ScoreTable } from "./ScoreTable";
import { SourceFailures } from "./SourceFailures";
import { TodayHeader } from "./TodayHeader";
import { WorthDoingNext } from "./WorthDoingNext";

/** Today: scan status, briefing, paid spend, backup warnings, scores per product and the open actions worth a look. */
export function TodayView({
  today,
  costMeter,
  backup,
  now,
  timeZone,
  locale,
}: {
  today: TodaySummary;
  /** Real spend even on the sample Today: the ledger is never sample data. */
  costMeter: CostMeterView;
  /** Real backup health even on the sample Today: shown only when it needs a look. */
  backup: Pick<BackupStatus, "health" | "lastFailure" | "enabled" | "next">;
  now: Date;
  timeZone: string;
  locale: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <RefreshWhileScanning active={today.scanning} />
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
      <CostMeter view={costMeter} now={now} timeZone={timeZone} locale={locale} />
      <BackupNotice backup={backup} timeZone={timeZone} locale={locale} />
      {today.isSample && <SampleBanner />}
      <SourceFailures failures={today.failures} />
      <ScoreTable scores={today.scores} />
      <WorthDoingNext actions={today.actions} more={today.moreActions} />
    </div>
  );
}
