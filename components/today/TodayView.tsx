import Link from "next/link";
import { RefreshWhileScanning } from "@/components/products/RefreshWhileScanning";
import type { CostMeterView } from "@/lib/costs/meter-view";
import type { BackupStatus } from "@/lib/ops/backup-status";
import type { TodaySummary } from "@/lib/today/types";
import { ActionCard } from "./ActionCard";
import { BackupNotice } from "./BackupNotice";
import { CostMeter } from "./CostMeter";
import { SampleBanner } from "./SampleBanner";
import { ScoreTable } from "./ScoreTable";
import { SourceFailures } from "./SourceFailures";
import { TodayHeader } from "./TodayHeader";

/** Today: scan status, headline, paid spend, backup warnings, scores per product and the open actions worth a look. */
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
  backup: Pick<BackupStatus, "health" | "lastFailure">;
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
        headline={today.headline}
      />
      <CostMeter view={costMeter} now={now} timeZone={timeZone} locale={locale} />
      <BackupNotice backup={backup} />
      {today.isSample && <SampleBanner />}
      <SourceFailures failures={today.failures} />
      <ScoreTable scores={today.scores} />
      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="font-serif text-xl">
          Worth your attention
        </h2>
        {today.actions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing open — new actions arrive with each scan.
          </p>
        ) : (
          today.actions.map((action) => <ActionCard key={action.id} action={action} />)
        )}
        {today.moreActions > 0 && (
          <p className="text-sm">
            <Link href="/actions" className="rounded-sm text-accent underline underline-offset-2">
              {today.moreActions} more on the Actions board
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
