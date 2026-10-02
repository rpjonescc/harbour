import { TodayView } from "@/components/today/TodayView";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { costMeterView } from "@/lib/costs/meter-view";
import { getDb } from "@/lib/db/client";
import { backupStatus } from "@/lib/ops/backup-status";
import { getProducts } from "@/lib/products/catalog";
import { todaySummary } from "@/lib/today/from-scans";

export default async function TodayPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const now = new Date();
  const db = getDb();
  const backup = backupStatus(db, config, now);
  return (
    <TodayView
      today={todaySummary(db, getProducts(), now, backup.health)}
      costMeter={costMeterView(db, config, now)}
      backup={backup}
      now={now}
      timeZone={config.HARBOUR_TIMEZONE}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
