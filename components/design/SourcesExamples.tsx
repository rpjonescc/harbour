import { ConnectionList } from "@/components/sources/ConnectionList";
import { ProductSourcesTable } from "@/components/sources/ProductSourcesTable";
import { ScheduleCard } from "@/components/sources/ScheduleCard";
import { SourceFailures } from "@/components/today/SourceFailures";
import { DocsLink } from "@/components/ui/DocsLink";
import { DOCS_LINKS } from "@/lib/docs-links";
import { EXAMPLE_SOURCES } from "./scan-example-data";

/** Fictional Sources page and Today banner states. */
export function SourcesExamples({ productId }: { productId: string }) {
  const [product] = EXAMPLE_SOURCES.products;
  return (
    <div className="flex flex-col gap-6">
      <SourceFailures
        failures={[
          { productId, collector: "pagespeed", error: "PageSpeed Insights quota exceeded" },
        ]}
      />
      <ScheduleCard enabled timeZone="Europe/London" />
      <ScheduleCard enabled={false} timeZone="Europe/London" />
      <ConnectionList view={EXAMPLE_SOURCES} />
      {product && <ProductSourcesTable product={product} timeZone="Europe/London" locale="en-GB" />}
      <p className="text-sm">
        <DocsLink href={DOCS_LINKS.scores}>A documentation link</DocsLink>
      </p>
    </div>
  );
}
