import Link from "next/link";
import type { ReactNode } from "react";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { CANT_OPEN_BACKUP_FOLDER } from "@/lib/explain/backups";
import { formatShortDateTime, formatWeekdayTime } from "@/lib/format/date";
import type { BackupStatus } from "@/lib/ops/backup-status";

const SETTINGS = (text: string) => (
  <Link href="/settings#backups" className="rounded-sm text-accent hover:underline">
    {text}
  </Link>
);
/** Does it matter: the live database is untouched; only the spare copies are behind. */
const STILL_SAFE = "Your live data is fine, but your newest spare copy is older than it should be.";
/** No spare copy at all yet makes it matter more. */
const NO_COPY_YET =
  "Your live data is fine, but you don't have a spare copy yet, so getting this working matters.";
/** The folder can't be read, so whether a spare copy exists is unknown (a gap, not "none"). */
const CANT_CHECK = `Your live data is fine, but ${CANT_OPEN_BACKUP_FOLDER} to check your spare copies.`;

type Props = {
  backup: Pick<BackupStatus, "health" | "lastFailure" | "enabled" | "next" | "latest" | "count">;
  timeZone: string;
  locale: string;
  /** Names the Technical details for screen readers when several notices share a page (/design). */
  detailsTopic?: string;
};

function failedMessage({ backup, timeZone, locale }: Props): ReactNode {
  const { lastFailure, next } = backup;
  const what = lastFailure
    ? `The backup on ${formatShortDateTime(lastFailure.at, timeZone, locale)} didn't finish.`
    : "The last backup didn't finish.";
  const matters = backup.latest ? STILL_SAFE : backup.count === null ? CANT_CHECK : NO_COPY_YET;
  // Only the schedule retries; with it off, nothing runs until the owner chooses Back up now.
  if (backup.enabled && next) {
    return (
      <>
        {what} {matters} Harbour tries again at {formatWeekdayTime(next, timeZone, locale)} —{" "}
        {SETTINGS("details in Settings")}.
      </>
    );
  }
  return (
    <>
      {what} {matters} Nightly backups are off, so run {SETTINGS("Back up now in Settings")}.
    </>
  );
}

function message(props: Props): ReactNode {
  if (props.backup.health === "stale") {
    return (
      <>
        No backup in the last 2 days. Your live data is fine, but there's no recent spare copy.
        Check that Harbour's background worker is running — {SETTINGS("details in Settings")}.
      </>
    );
  }
  if (props.backup.health === "unreadable") {
    return (
      <>
        {CANT_OPEN_BACKUP_FOLDER}, so it can't check your spare copies. Check the folder's
        permissions — {SETTINGS("details in Settings")}.
      </>
    );
  }
  return failedMessage(props);
}

/** Today's notice when backups need a look: what happened, whether it matters, what to do. */
export function BackupNotice(props: Props) {
  const { health, lastFailure } = props.backup;
  if (health !== "failed" && health !== "stale" && health !== "unreadable") return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink"
    >
      <p>{message(props)}</p>
      {health === "failed" && (
        <TechnicalDetails id="today-backup" topic={props.detailsTopic ?? "backup error"}>
          <p className="font-mono">{lastFailure?.error ?? "No error was recorded."}</p>
        </TechnicalDetails>
      )}
    </div>
  );
}
