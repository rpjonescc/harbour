import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { ActionsView } from "@/lib/actions/board-view";
import type { ActionFilter } from "@/lib/actions/views";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import { STATUS_FILTER_LABEL } from "./action-labels";

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
 * resulting URL is the bookmark (`?product=&area=&status=`). The board has no status filter (its
 * columns are the statuses); the list keeps `view=list` so applying stays on the list.
 */
export function ActionFilters({
  filter,
  products,
  view = "list",
}: {
  filter: ActionFilter;
  products: readonly { id: string; name: string }[];
  view?: ActionsView;
}) {
  const board = view === "board";
  const filtered =
    filter.productId !== null || filter.area !== null || (!board && filter.status !== "active");
  return (
    // Keyed by the filter: a client navigation (Clear filters, back) re-renders the page in place,
    // and uncontrolled selects would otherwise keep showing, and re-submit, the old choice.
    <form
      key={`${filter.productId}|${filter.area}|${filter.status}`}
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
          {AREA_ORDER.map((key) => (
            <option key={key} value={AREAS[key].code}>
              {AREAS[key].name}
            </option>
          ))}
        </select>
      </Field>
      {!board && (
        <Field id="filter-status" label="Status">
          <select id="filter-status" name="status" defaultValue={filter.status} className={SELECT}>
            {Object.entries(STATUS_FILTER_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!board && <input type="hidden" name="view" value="list" />}
      <Button type="submit" variant="ghost">
        Apply
      </Button>
      {filtered && (
        <Link
          href={board ? "/actions" : "/actions?view=list"}
          className="rounded-sm py-1.5 text-sm text-accent underline underline-offset-2"
        >
          Clear filters
        </Link>
      )}
    </form>
  );
}
