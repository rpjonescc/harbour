import type { Product } from "@/lib/products/catalog";

/** Decorative product colour dot; the product name is always shown next to it. */
export function ProductDot({ product }: { product: Pick<Product, "hue"> }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-1.5 shrink-0 rounded-full"
      style={{ background: `var(--hue-${product.hue})` }}
    />
  );
}
