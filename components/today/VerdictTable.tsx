import Link from "next/link";
import { VerdictLine } from "@/components/explain/VerdictLine";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import { GAP_REASONS } from "@/lib/explain/verdict";
import { productById } from "@/lib/products/catalog";
import type { ProductScores } from "@/lib/today/types";

/** One row per product, one plain-named column per area, each cell a compact verdict. */
export function VerdictTable({ scores }: { scores: ProductScores[] }) {
  const anyPartial = scores.some((row) =>
    AREA_ORDER.some((key) => row.totals[key] !== null && !row.complete[key]),
  );
  return (
    <Panel className="overflow-x-auto px-4">
      <table className="w-full text-sm" aria-label="Scores by product">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-2.5 pr-3 font-normal">
              Product
            </th>
            {AREA_ORDER.map((key) => (
              <th key={key} scope="col" className="py-2.5 pr-3 font-normal">
                {AREAS[key].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => {
            const product = productById(row.productId);
            const missingReason = row.scanned ? GAP_REASONS.dataMissing : GAP_REASONS.notChecked;
            return (
              <tr key={row.productId} className="border-t border-line align-top">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <Link
                    href={`/products/${product.id}`}
                    className="inline-flex items-center gap-2 rounded-sm hover:text-accent"
                  >
                    <ProductDot product={product} />
                    {product.name}
                  </Link>
                </th>
                {AREA_ORDER.map((key) => (
                  <td key={key} className="py-2.5 pr-3">
                    <VerdictLine
                      compact
                      area={key}
                      score={row.totals[key]}
                      delta={row.deltas[key]}
                      complete={row.complete[key]}
                      missingReason={missingReason}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {anyPartial && (
        <p className="border-t border-line py-2 text-2xs text-ink-muted">
          <span aria-hidden="true" className="text-warn">
            *
          </span>{" "}
          Some data was missing in the last check, so this verdict may change. Open the product to
          see what's missing.
        </p>
      )}
    </Panel>
  );
}
