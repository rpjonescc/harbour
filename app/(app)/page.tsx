import { TowerView } from "@/components/tower";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProducts } from "@/lib/products/catalog";
import { loadTower } from "@/lib/tower/load";

export default async function TodayPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const now = new Date();
  const tower = loadTower(getDb(), config, getProducts(), now);
  return (
    <TowerView
      tower={tower}
      now={now}
      timeZone={config.HARBOUR_TIMEZONE}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
