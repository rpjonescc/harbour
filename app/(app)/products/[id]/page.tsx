import { notFound } from "next/navigation";
import { ProductOverview } from "@/components/products/ProductOverview";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProducts, getTracking } from "@/lib/products/catalog";
import { outsideView } from "@/lib/scan/outside-view";
import { productView } from "@/lib/scan/product-view";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const { id } = await params;
  const product = getProducts().find((p) => p.id === id);
  if (!product) notFound();
  const config = getConfig();
  const db = getDb();
  const now = new Date();
  return (
    <ProductOverview
      product={product}
      view={productView(db, product, now)}
      outside={outsideView({ db, config, product, tracking: getTracking(id), now })}
      timeZone={config.HARBOUR_TIMEZONE}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
