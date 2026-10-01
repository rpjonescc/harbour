import { TodayView } from "@/components/today/TodayView";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProducts } from "@/lib/products/catalog";
import { todaySummary } from "@/lib/today/from-scans";

export default async function TodayPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const now = new Date();
  return (
    <TodayView
      today={todaySummary(getDb(), getProducts(), now)}
      now={now}
      timeZone={config.HARBOUR_TIMEZONE}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
