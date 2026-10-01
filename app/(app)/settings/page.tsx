import { SettingsOverview } from "@/components/settings/SettingsOverview";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProductConfig } from "@/lib/products/catalog";
import { settingsView } from "@/lib/settings/view";

export default async function SettingsPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const { products, demo } = getProductConfig();
  const now = new Date();
  return (
    <SettingsOverview
      view={settingsView(getDb(), products, config, now, demo)}
      now={now}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
