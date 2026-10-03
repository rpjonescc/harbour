import Link from "next/link";
import { PageHeader } from "@/components/explain/PageHeader";
import { ProductDot } from "@/components/ui/ProductDot";
import { productVerdict } from "@/lib/explain/product-summary";
import type { Product } from "@/lib/products/catalog";
import type { FormulaChange, ScanState, ScoreTrend } from "@/lib/scan/views";
import { AreaCards } from "./AreaCards";
import { ScanNowButton } from "./ScanNowButton";
import { ScanStatusNote } from "./ScanStatusNote";
import { ScoringNote } from "./ScoringNote";

/**
 * Product name, its verdict and links, Check now, where the latest check stands and the three
 * area cards.
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
        verdict={productVerdict(product.name, scores.latest?.totals ?? null, scan.active !== null)}
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
      <AreaCards scores={scores} scan={scan} />
      <ScoringNote change={formulaChange} kind={product.kind} />
    </div>
  );
}
