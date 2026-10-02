import { ProductDot } from "@/components/ui/ProductDot";
import { openActionCount } from "@/lib/actions/views";
import { brainNewCount } from "@/lib/brain/runtime";
import { getConfig } from "@/lib/config";
import { countReadyPieces } from "@/lib/content/read/ready-count";
import { getDb } from "@/lib/db/client";
import { thingsWorthDoing } from "@/lib/explain/actions";
import { getContentProducts, getProductConfig } from "@/lib/products/catalog";
import type { ThemePreference } from "@/lib/theme";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";

/** Left rail: brand, navigation, products, and device controls. */
export function Sidebar({ theme }: { theme: ThemePreference }) {
  const { products, demo } = getProductConfig();
  const brainNew = brainNewCount();
  const openActions = openActionCount(
    getDb(),
    products.map((p) => p.id),
  );
  const config = getConfig();
  const contentOn = config.HARBOUR_CONTENT === "on";
  // The Content page is a 404 when content is off, so the link is not offered either.
  const items = NAV_ITEMS.filter((item) => contentOn || item.href !== "/content");
  const hrefs = items.map((item) => item.href);
  // Null when the folder can't be read: the badge is hidden rather than showing a wrong number.
  const ready = contentOn ? countReadyPieces(config.HARBOUR_BRAIN_DIR, getContentProducts()) : null;
  const badges = {
    "content-ready": ready === null ? undefined : { count: ready, label: `${ready} ready for you` },
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
        {items.map((item) => (
          <NavLink
            key={item.label}
            href={item.href}
            hrefs={hrefs}
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
