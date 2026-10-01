import Link from "next/link";
import { ProductDot } from "@/components/ui/ProductDot";
import type { SettingsView } from "@/lib/settings/view";
import { SettingsSection } from "./SettingsSection";

const LINK = "rounded-sm text-accent hover:underline";

/** The products in harbour.config.json, with Search Console and research targets to approve. */
export function ProductsCard({
  products,
  isDemoConfig,
  anchor,
}: Pick<SettingsView, "products" | "isDemoConfig"> & { anchor?: string }) {
  return (
    <SettingsSection anchor={anchor} title="Products">
      {isDemoConfig && (
        <p className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
          Demo config — add harbour.config.json to list your products.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {products.map((product) => (
          <li key={product.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ProductDot product={product} />
              {product.name}
              <span className="font-normal text-ink-muted">{product.url}</span>
            </p>
            <p className="text-xs text-ink-muted">
              {product.searchConsoleProperty ? (
                <code className="font-mono">{product.searchConsoleProperty}</code>
              ) : (
                "No Search Console property"
              )}
            </p>
            <p className="text-xs">
              {product.awaitingApproval > 0 ? (
                <Link href={`/settings/products/${product.id}`} className={LINK}>
                  {product.awaitingApproval} research{" "}
                  {product.awaitingApproval === 1 ? "target" : "targets"} waiting for approval
                </Link>
              ) : (
                <span className="text-ink-muted">No research targets waiting</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
