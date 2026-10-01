import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { ScoreValue } from "@/components/ui/ScoreValue";
import { Sparkline } from "@/components/ui/Sparkline";
import { productById } from "@/lib/products/catalog";
import { AREA_KEYS } from "@/lib/scan/views";
import type { ProductScores } from "@/lib/today/types";

/** SEO/GEO/AEO scores per product with deltas and a 30-day SEO trend. */
export function ScoreTable({ scores }: { scores: ProductScores[] }) {
  const anyIncomplete = scores.some((row) =>
    AREA_KEYS.some((key) => row.totals[key] !== null && !row.complete[key]),
  );
  return (
    <Panel className="px-4">
      <table className="w-full text-sm" aria-label="Visibility scores by product">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-2.5 font-normal">
              Product
            </th>
            {AREA_KEYS.map((key) => (
              <th key={key} scope="col" className="w-20 py-2.5 text-right font-normal">
                {key.toUpperCase()}
              </th>
            ))}
            <th scope="col" className="w-20 py-2.5 text-right font-normal">
              30 days
            </th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => {
            const product = productById(row.productId);
            return (
              <tr key={row.productId} className="border-t border-line">
                <th scope="row" className="py-2.5 text-left font-normal">
                  <Link
                    href={`/products/${product.id}`}
                    className="inline-flex items-center gap-2 rounded-sm hover:text-accent"
                  >
                    <ProductDot product={product} />
                    {product.name}
                  </Link>
                </th>
                {AREA_KEYS.map((key) => (
                  <td key={key} className="py-2.5 text-right">
                    <ScoreValue
                      value={row.totals[key]}
                      delta={row.deltas[key]}
                      complete={row.complete[key]}
                    />
                  </td>
                ))}
                <td className="py-2.5 text-right">
                  {row.trend.length > 1 ? (
                    <Sparkline
                      values={row.trend}
                      label={`${product.name} SEO trend over 30 days`}
                    />
                  ) : (
                    <span className="text-ink-muted">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Not enough scans for a trend yet</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {anyIncomplete && (
        <p className="border-t border-line py-2 text-2xs text-ink-muted">
          <span aria-hidden="true" className="text-warn">
            *
          </span>{" "}
          Incomplete: a source is not connected or failed. Open the product to see why.
        </p>
      )}
    </Panel>
  );
}
