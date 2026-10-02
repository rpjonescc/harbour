import { ProductDot } from "@/components/ui/ProductDot";
import { openActionCount } from "@/lib/actions/views";
import { brainNewCount } from "@/lib/brain/runtime";
import { getDb } from "@/lib/db/client";
import { thingsWorthDoing } from "@/lib/explain/actions";
import { getProductConfig } from "@/lib/products/catalog";
import type { ThemePreference } from "@/lib/theme";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";

const NAV_HREFS = NAV_ITEMS.map((item) => item.href);

/** Left rail: brand, navigation, products, and device controls. */
export function Sidebar({ theme }: { theme: ThemePreference }) {
  const { products, demo } = getProductConfig();
  const brainNew = brainNewCount();
  const openActions = openActionCount(
    getDb(),
    products.map((p) => p.id),
  );
  const badges = {
    "brain-new":
      brainNew === null
        ? undefined
        : {
            count: brainNew,
            label: `${brainNew} new ${brainNew === 1 ? "document" : "documents"}`,
          },
    "actions-open": {
      count: openActions,
      label: thingsWorthDoing(openActions),
    },
  };
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-sunk p-3">
      <p className="px-2 pb-4 pt-1 font-serif text-xl">Harbour</p>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            href={item.href}
            hrefs={NAV_HREFS}
            badge={item.badge && badges[item.badge]}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <section aria-labelledby="products-heading" className="mt-6">
        <h2
          id="products-heading"
          className="px-2 pb-1 text-2xs uppercase tracking-widest text-ink-muted"
        >
          Products
        </h2>
        <ul className="flex flex-col gap-0.5">
          {products.map((product) => (
            <li key={product.id}>
              <NavLink href={`/products/${product.id}`}>
                <ProductDot product={product} />
                {product.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        <ThemeToggle initial={theme} />
        <LogoutButton />
        {demo && (
          <p className="px-2 pt-2 text-2xs text-ink-muted">
            Demo config — add harbour.config.json to list your products.
          </p>
        )}
      </div>
    </aside>
  );
}
