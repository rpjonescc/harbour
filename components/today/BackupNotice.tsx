import Link from "next/link";
import type { ReactNode } from "react";
import { formatShortDateTime, formatWeekdayTime } from "@/lib/format/date";
import type { BackupStatus } from "@/lib/ops/backup-status";

const SETTINGS = (text: string) => (
  <Link href="/settings#backups" className="rounded-sm text-accent hover:underline">
    {text}
  </Link>
);

type Props = {
  backup: Pick<BackupStatus, "health" | "lastFailure" | "enabled" | "next">;
  timeZone: string;
  locale: string;
};

function message({ backup, timeZone, locale }: Props): ReactNode {
  const { health, lastFailure, next } = backup;
  if (health === "stale") {
    return (
      <>
        No backup in the last 2 days. Check that the worker is running —{" "}
        {SETTINGS("details in Settings")}.
      </>
    );
  }
  if (health === "unreadable") {
    return (
      <>
        Harbour can't read the backup folder — check its permissions.{" "}
        {SETTINGS("Details in Settings")}.
      </>
    );
  }
  const when = lastFailure ? ` on ${formatShortDateTime(lastFailure.at, timeZone, locale)}` : "";
  const failed = `The backup${when} failed: ${lastFailure?.error ?? "unknown error"}.`;
  // Only the schedule retries; with it off, nothing runs until the owner chooses Back up now.
  return backup.enabled && next ? (
    <>
      {failed} Harbour tries again at {formatWeekdayTime(next, timeZone, locale)} —{" "}
      {SETTINGS("details in Settings")}.
    </>
  ) : (
    <>
      {failed} Nightly backups are off — run {SETTINGS("Back up now in Settings")}.
    </>
  );
}

/** Today's warning when backups need a look (failed, stale or unreadable); nothing otherwise. */
export function BackupNotice(props: Props) {
  if (!["failed", "stale", "unreadable"].includes(props.backup.health)) return null;
  return (
    <div role="status" className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
      <p>{message(props)}</p>
    </div>
  );
}
