import { PageHeader } from "@/components/explain/PageHeader";
import { SOURCES_INTRO } from "@/lib/explain/sources-page";
import type { SourcesView } from "@/lib/scan/sources-view";
import { ConnectionList } from "./ConnectionList";
import { ProductSourcesTable } from "./ProductSourcesTable";
import { ScheduleCard } from "./ScheduleCard";

/** The Sources page: schedule, connections and each product's latest source runs. */
export function SourcesOverview({ view, locale }: { view: SourcesView; locale: string }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Sources" intro={SOURCES_INTRO} page="sources" />
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
