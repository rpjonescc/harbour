import { notFound } from "next/navigation";
import { ProductOverview } from "@/components/products/ProductOverview";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProducts } from "@/lib/products/catalog";
import { productView } from "@/lib/scan/product-view";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const { id } = await params;
  const product = getProducts().find((p) => p.id === id);
  if (!product) notFound();
  const config = getConfig();
  return (
    <ProductOverview
      product={product}
      view={productView(getDb(), product, new Date())}
      timeZone={config.HARBOUR_TIMEZONE}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
