import Link from "next/link";
import type { BackupStatus } from "@/lib/ops/backup-status";

const DETAILS = (
  <Link href="/settings#backups" className="rounded-sm text-accent hover:underline">
    details in Settings
  </Link>
);

/** Today's warning when backups need a look (failed or stale); nothing otherwise. */
export function BackupNotice({ backup }: { backup: Pick<BackupStatus, "health" | "lastFailure"> }) {
  if (backup.health !== "failed" && backup.health !== "stale") return null;
  return (
    <div role="status" className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
      {backup.health === "failed" ? (
        <p>
          Last night's backup failed: {backup.lastFailure?.error ?? "unknown error"}. Harbour tries
          again at 03:15 — {DETAILS}.
        </p>
      ) : (
        <p>No backup in the last 2 days. Check that the worker is running — {DETAILS}.</p>
      )}
    </div>
  );
}
