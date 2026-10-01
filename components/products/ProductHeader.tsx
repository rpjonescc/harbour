import Link from "next/link";
import { ProductDot } from "@/components/ui/ProductDot";
import type { Product } from "@/lib/products/catalog";
import type { ScanState, ScoreTrend } from "@/lib/scan/views";
import { ScanNowButton } from "./ScanNowButton";
import { ScanStatusNote } from "./ScanStatusNote";
import { ScoreTiles } from "./ScoreTiles";

/** Product name and links, Scan now, where scanning stands and the three scores. */
export function ProductHeader({
  product,
  scores,
  scan,
  timeZone,
  locale,
}: {
  product: Product;
  scores: ScoreTrend;
  scan: ScanState;
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
      <ScoreTiles scores={scores} />
    </header>
  );
}
