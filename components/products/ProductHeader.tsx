import Link from "next/link";
import { ProductDot } from "@/components/ui/ProductDot";
import { productSummary } from "@/lib/explain/product-summary";
import type { Product } from "@/lib/products/catalog";
import type { FormulaChange, ScanState, ScoreTrend } from "@/lib/scan/views";
import { AreaCards } from "./AreaCards";
import { ScanNowButton } from "./ScanNowButton";
import { ScanStatusNote } from "./ScanStatusNote";
import { ScoringNote } from "./ScoringNote";

/**
 * Product name and links, Scan now, where scanning stands, a one-line summary and the three area
 * cards.
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
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-3xl">
            <ProductDot product={product} />
            {product.name}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-muted">
            <a href={product.url} className="hover:text-ink hover:underline">
              {product.url}
            </a>
            <Link href={`/settings/products/${product.id}`} className="text-accent hover:underline">
              Research targets
            </Link>
          </p>
        </div>
        <ScanNowButton productId={product.id} active={scan.active?.status ?? null} />
      </div>
      <ScanStatusNote scan={scan} latest={scores.latest} timeZone={timeZone} locale={locale} />
      <p className="text-base text-ink">
        {productSummary(product.name, scores.latest?.totals ?? null)}
      </p>
      <AreaCards scores={scores} scan={scan} />
      {/* Only product sites lost the Preferred Sources weight, so only theirs moved. */}
      {product.kind === "product" && <ScoringNote change={formulaChange} />}
    </header>
  );
}
