import Link from "next/link";
import { PageHeader } from "@/components/explain/PageHeader";
import { ProductDot } from "@/components/ui/ProductDot";
import { productSummary } from "@/lib/explain/product-summary";
import type { Product } from "@/lib/products/catalog";
import type { FormulaChange, ScanState, ScoreTrend } from "@/lib/scan/views";
import { AreaCards } from "./AreaCards";
import { ScanNowButton } from "./ScanNowButton";
import { ScanStatusNote } from "./ScanStatusNote";
import { ScoringNote } from "./ScoringNote";

/**
 * Product name and links, Check now, where the latest check stands, a one-line summary and the
 * three area cards.
 */
export function ProductHeader({
  product,
  scores,
  scan,
  formulaChange,
  timeZone,
  locale,
}: {
  product: Product;
  scores: ScoreTrend;
  scan: ScanState;
  formulaChange: FormulaChange | null;
  timeZone: string;
  locale: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        page="product"
        title={
          <span className="flex items-center gap-2">
            <ProductDot product={product} />
            {product.name}
          </span>
        }
        intro={
          <p className="flex flex-wrap gap-x-3">
            <a href={product.url} className="hover:text-ink hover:underline">
              {product.url}
            </a>
            <Link href={`/settings/products/${product.id}`} className="text-accent hover:underline">
              Research targets
            </Link>
          </p>
        }
      >
        <ScanNowButton productId={product.id} active={scan.active?.status ?? null} />
      </PageHeader>
      <ScanStatusNote scan={scan} latest={scores.latest} timeZone={timeZone} locale={locale} />
      <p className="text-base text-ink">
        {productSummary(product.name, scores.latest?.totals ?? null)}
      </p>
      <AreaCards scores={scores} scan={scan} />
      {/* Only product sites lost the Preferred Sources weight, so only theirs moved. */}
      {product.kind === "product" && <ScoringNote change={formulaChange} />}
    </div>
  );
}
