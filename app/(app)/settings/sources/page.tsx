import { SourcesOverview } from "@/components/sources/SourcesOverview";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProducts } from "@/lib/products/catalog";
import { sourcesView } from "@/lib/scan/sources-view";

export default async function SourcesPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  return (
    <SourcesOverview
      view={sourcesView(getDb(), getProducts(), config, new Date())}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
