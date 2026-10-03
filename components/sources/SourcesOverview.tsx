import { PageHeader } from "@/components/explain/PageHeader";
import { TermLine } from "@/components/explain/TermLine";
import { SOURCES_INTRO, sourcesVerdict } from "@/lib/explain/sources-page";
import type { SourcesView } from "@/lib/scan/sources-view";
import { ConnectionList } from "./ConnectionList";
import { ProductSourcesTable } from "./ProductSourcesTable";
import { ScheduleCard } from "./ScheduleCard";

/** The Sources page: its verdict, schedule, connections and each product's latest source runs. */
export function SourcesOverview({ view, locale }: { view: SourcesView; locale: string }) {
  const verdict = sourcesVerdict(
    view.products.map((product) => ({
      name: product.name,
      checking: product.active !== null,
      checked: product.lastScan !== null,
      failed: product.runs.filter((run) => run.status === "failed").map((run) => run.collector),
    })),
  );
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Sources"
        page="sources"
        verdict={verdict}
        intro={
          <p>
            <TermLine line={SOURCES_INTRO} />
          </p>
        }
      />
      <ScheduleCard enabled={view.schedule.enabled} timeZone={view.schedule.timeZone} />
      <ConnectionList view={view} />
      {view.products.map((product) => (
        <ProductSourcesTable
          key={product.productId}
          product={product}
          timeZone={view.schedule.timeZone}
          locale={locale}
        />
      ))}
    </div>
  );
}
