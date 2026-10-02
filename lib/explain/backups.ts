import type { BackupHealth } from "@/lib/ops/backup-status";

/** One wording for the unreadable-folder case on Today, in the briefing and in Settings. */
export const CANT_OPEN_BACKUP_FOLDER = "Harbour can't open the backup folder";

export const BACKUP_HEALTH_LABEL: Readonly<Record<BackupHealth, string>> = {
  ok: "Up to date",
  "none-yet": "No backup yet",
  failed: "Last backup didn't finish",
  stale: "No recent backup",
  off: "Nightly backups are off",
  unreadable: "Can't open the backup folder",
};
