import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionFilter } from "@/lib/actions/views";
import { STATUS_FILTER_LABEL } from "./action-labels";

const AREAS = ["SEO", "GEO", "AEO"] as const;
const SELECT = "rounded-sm border border-line bg-surface px-2 py-1.5 text-sm text-ink";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Product, area and status filters as a plain GET form: works without JavaScript, and the
 * resulting URL is the bookmark (`?product=&area=&status=`).
 */
export function ActionFilters({
  filter,
  products,
}: {
  filter: ActionFilter;
  products: readonly { id: string; name: string }[];
}) {
  const filtered = filter.productId !== null || filter.area !== null || filter.status !== "active";
  return (
    <form
      method="get"
      action="/actions"
      aria-label="Filter actions"
      className="flex flex-wrap items-end gap-3"
    >
      <Field id="filter-product" label="Product">
        <select
          id="filter-product"
          name="product"
          defaultValue={filter.productId ?? ""}
          className={SELECT}
        >
          <option value="">All products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="filter-area" label="Area">
        <select id="filter-area" name="area" defaultValue={filter.area ?? ""} className={SELECT}>
          <option value="">All areas</option>
          {AREAS.map((area) => (
            <option key={area}>{area}</option>
          ))}
        </select>
      </Field>
      <Field id="filter-status" label="Status">
        <select id="filter-status" name="status" defaultValue={filter.status} className={SELECT}>
          {Object.entries(STATUS_FILTER_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" variant="ghost">
        Apply
      </Button>
      {filtered && (
        <Link
          href="/actions"
          className="rounded-sm py-1.5 text-sm text-accent underline underline-offset-2"
        >
          Clear filters
        </Link>
      )}
    </form>
  );
}
