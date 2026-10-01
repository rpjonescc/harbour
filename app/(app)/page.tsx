import { ActionCard } from "@/components/today/ActionCard";
import { SampleBanner } from "@/components/today/SampleBanner";
import { ScoreTable } from "@/components/today/ScoreTable";
import { TodayHeader } from "@/components/today/TodayHeader";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";

export default async function TodayPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const today = sampleToday(getProducts());
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <TodayHeader
        now={new Date()}
        timeZone={config.HARBOUR_TIMEZONE}
        locale={config.HARBOUR_LOCALE}
        scannedAt={today.scannedAt}
        headline={today.headline}
      />
      {today.isSample && <SampleBanner />}
      <ScoreTable scores={today.scores} />
      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="font-serif text-xl">
          Worth your attention
        </h2>
        {today.actions.map((action) => (
          <ActionCard key={action.id} action={action} />
        ))}
      </section>
    </div>
  );
}
