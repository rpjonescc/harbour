import { pathToFileURL } from "node:url";
import type { Db } from "@/lib/db/client";
import { localTime } from "@/lib/format/zoned-time";
import { enqueueBackup } from "@/lib/ops/backup-schedule";

/** Queues a backup of the current local day in `timeZone`; it counts as that day's backup. */
export function queueBackupNow(
  db: Db,
  timeZone: string,
  now = new Date(),
): { id: number; created: boolean; day: string } {
  const day = localTime(timeZone, now).day;
  return { ...enqueueBackup(db, day, null, now), day };
}

async function main() {
  // Imported lazily so the unit test never loads the real database or config.
  const { getConfig } = await import("@/lib/config");
  const { getDb } = await import("@/lib/db/client");
  const job = queueBackupNow(getDb(), getConfig().HARBOUR_TIMEZONE);
  console.log(`${job.created ? "queued" : "already queued"} #${job.id} backup ${job.day}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
