import { Tabs } from "@/components/ui/Tabs";
import { AREAS } from "@/lib/explain/areas";
import type { Product } from "@/lib/products/catalog";
import type { ProductView } from "@/lib/scan/product-view";
import { AREA_KEYS } from "@/lib/scan/views";
import { IssueList } from "./IssueList";
import { PagesTable } from "./PagesTable";
import { PaidSourcePanels } from "./PaidSourcePanels";
import { ProductHeader } from "./ProductHeader";
import { RefreshWhileScanning } from "./RefreshWhileScanning";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { SearchConsolePanel } from "./SearchConsolePanel";

/** A product's page: scores and their breakdowns, issues, pages and data sources. */
export function ProductOverview({
  product,
  view,
  timeZone,
  locale,
}: {
  product: Product;
  view: ProductView;
  timeZone: string;
  locale: string;
}) {
  const { latest } = view.scores;
  const tabs = AREA_KEYS.map((area) => ({
    id: area,
    label: AREAS[area].name,
    panel: (
      <ScoreBreakdown
        area={area}
        entries={latest?.breakdown ?? []}
        complete={latest?.complete[area] ?? true}
      />
    ),
  }));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <RefreshWhileScanning active={view.scan.active !== null} />
      <ProductHeader
        product={product}
        scores={view.scores}
        scan={view.scan}
        formulaChange={view.formulaChange}
        timeZone={timeZone}
        locale={locale}
      />
      <section aria-labelledby="breakdown-heading" className="flex flex-col gap-2">
        <h2 id="breakdown-heading" className="font-serif text-xl">
          What's behind each rating
        </h2>
        <Tabs label="Score breakdown" tabs={tabs} />
      </section>
      <IssueList
        issues={view.issues}
        actionByRule={view.actionByRule}
        product={product}
        scanned={latest !== null}
        locale={locale}
      />
      <PagesTable rows={view.pages.rows} total={view.pages.total} />
      <SearchConsolePanel search={view.search} locale={locale} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PaidSourcePanels />
      </div>
    </div>
  );
}
