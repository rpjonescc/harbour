import { Delta } from "@/components/ui/Delta";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Sparkline } from "@/components/ui/Sparkline";
import { productById } from "@/lib/products/catalog";
import type { Area, ProductScores } from "@/lib/today/sample";

const AREAS: { area: Area; key: "seo" | "geo" | "aeo" }[] = [
  { area: "SEO", key: "seo" },
  { area: "GEO", key: "geo" },
  { area: "AEO", key: "aeo" },
];

/** SEO/GEO/AEO scores per product with deltas and a 30-day trend. */
export function ScoreTable({ scores }: { scores: ProductScores[] }) {
  return (
    <Panel className="px-4">
      <table className="w-full text-sm" aria-label="Visibility scores by product">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-2.5 font-normal">
              Product
            </th>
            {AREAS.map(({ area }) => (
              <th key={area} scope="col" className="w-16 py-2.5 text-right font-normal">
                {area}
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
                  <span className="inline-flex items-center gap-2">
                    <ProductDot product={product} />
                    {product.name}
                  </span>
                </th>
                {AREAS.map(({ area, key }) => (
                  <td key={area} className="py-2.5 text-right tabular-nums">
                    {row[key]}
                    <Delta value={row.deltas[area]} />
                  </td>
                ))}
                <td className="py-2.5 text-right">
                  <Sparkline values={row.trend} label={`${product.name} SEO trend over 30 days`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
