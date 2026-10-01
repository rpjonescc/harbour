import { ProductDot } from "@/components/ui/ProductDot";
import { getProductConfig } from "@/lib/products/catalog";
import type { ThemePreference } from "@/lib/theme";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";

/** Left rail: brand, navigation, products, and device controls. */
export function Sidebar({ theme }: { theme: ThemePreference }) {
  const { products, demo } = getProductConfig();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-sunk p-3">
      <p className="px-2 pb-4 pt-1 font-serif text-xl">Harbour</p>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.label} href={item.href}>
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
              <NavLink>
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
