import { RefreshWhileScanning } from "@/components/products/RefreshWhileScanning";
import type { TodaySummary } from "@/lib/today/types";
import { ActionCard } from "./ActionCard";
import { SampleBanner } from "./SampleBanner";
import { ScoreTable } from "./ScoreTable";
import { SourceFailures } from "./SourceFailures";
import { TodayHeader } from "./TodayHeader";

/** Today: scan status, headline, scores per product and the issues worth a look. */
export function TodayView({
  today,
  now,
  timeZone,
  locale,
}: {
  today: TodaySummary;
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
      {today.isSample && <SampleBanner />}
      <SourceFailures failures={today.failures} />
      <ScoreTable scores={today.scores} />
      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="font-serif text-xl">
          Worth your attention
        </h2>
        {today.actions.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing — the last scans found no issues.</p>
        ) : (
          today.actions.map((action) => (
            <ActionCard key={action.id} action={action} linked={!today.isSample} />
          ))
        )}
      </section>
    </div>
  );
}
