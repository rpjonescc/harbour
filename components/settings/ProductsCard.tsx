import Link from "next/link";
import { ProductDot } from "@/components/ui/ProductDot";
import { approvalsPhrase } from "@/lib/explain/approvals";
import { SETTINGS_PURPOSE } from "@/lib/explain/settings";
import type { SettingsView } from "@/lib/settings/view";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const LINK = "rounded-sm text-accent hover:underline";

/** The sites Harbour watches, with Search Console and research targets to approve. */
export function ProductsCard({
  products,
  isDemoConfig,
  section,
}: Pick<SettingsView, "products" | "isDemoConfig"> & { section?: SectionPlacement }) {
  return (
    <SettingsSection {...section} title="Products" purpose={SETTINGS_PURPOSE.products}>
      {isDemoConfig && (
        <p className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
          These are example sites, not yours yet.
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
                <>
                  Search Console site:{" "}
                  <code className="font-mono">{product.searchConsoleProperty}</code>
                </>
              ) : (
                "Search Console: not set up for this site yet"
              )}
            </p>
            <p className="text-xs">
              {product.awaitingApproval > 0 ? (
                <Link href={`/settings/products/${product.id}`} className={LINK}>
                  {approvalsPhrase(product.awaitingApproval)}{" "}
                  <span className="sr-only">for {product.name}</span>
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
