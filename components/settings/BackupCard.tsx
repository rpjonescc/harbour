import Link from "next/link";
import { DocsLink } from "@/components/ui/DocsLink";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";
import { formatShortDateTime } from "@/lib/format/date";
import { BACKUPS_KEPT } from "@/lib/ops/backup-files";
import type { BackupHealth, BackupStatus } from "@/lib/ops/backup-status";
import { BackUpNowButton } from "./BackUpNowButton";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const HEALTH: Record<BackupHealth, { text: string; tone: "accent" | "warn" | "neutral" }> = {
  ok: { text: "Healthy", tone: "accent" },
  "none-yet": { text: "No backup yet", tone: "neutral" },
  failed: { text: "Last backup failed", tone: "warn" },
  stale: { text: "No recent backup", tone: "warn" },
  off: { text: "Nightly backup off", tone: "neutral" },
  unreadable: { text: "Backup folder unreadable", tone: "warn" },
};
const LINK = "rounded-sm text-accent hover:underline";

type Props = {
  backups: BackupStatus;
  backupDirSet: boolean;
  timeZone: string;
  locale: string;
  section?: SectionPlacement;
  /** /design example: Back up now never calls the API. */
  demo?: boolean;
  /** The button's accessible name when several cards share a page (the /design examples). */
  buttonLabel?: string;
};

/** Backup health, the newest copy, what retention last did, and Back up now. */
export function BackupCard(props: Props) {
  const { backups, backupDirSet, timeZone, locale, section, demo = false, buttonLabel } = props;
  const at = (date: Date) => formatShortDateTime(date, timeZone, locale);
  const { latest, lastFailure, lastRetention } = backups;
  const health = HEALTH[backups.health];
  return (
    <SettingsSection
      {...section}
      title="Backups"
      aside={<Tag tone={health.tone}>{health.text}</Tag>}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {backups.count === null ? (
          <>
            <dt className="text-ink-muted">Backups</dt>
            <dd>Harbour can't read the backup folder — check its permissions</dd>
          </>
        ) : (
          <>
            <dt className="text-ink-muted">Last backup</dt>
            <dd>
              {latest
                ? `${at(latest.modifiedAt)} · ${(latest.bytes / 1_000_000).toFixed(1)} MB`
                : "No backup yet"}
            </dd>
            <dt className="text-ink-muted">Kept</dt>
            <dd>
              {backups.count} of {BACKUPS_KEPT} kept
            </dd>
          </>
        )}
        <dt className="text-ink-muted">Where</dt>
        <dd>
          {backupDirSet ? (
            <>
              The folder in <code className="font-mono text-xs">HARBOUR_BACKUP_DIR</code>
            </>
          ) : (
            "A backups folder next to the database"
          )}
        </dd>
        <dt className="text-ink-muted">Retention</dt>
        <dd>
          {lastRetention ? (
            <Link href={`/agents/${lastRetention.jobId}`} className={LINK}>
              {at(lastRetention.at)}: {lastRetention.summary ?? lastRetention.status}
            </Link>
          ) : (
            "Not run yet — it runs after each verified backup"
          )}
        </dd>
      </dl>
      {lastFailure && (
        <p className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
          <Link href={`/agents/${lastFailure.jobId}`} className={LINK}>
            Backup failed {at(lastFailure.at)}
          </Link>
          : {lastFailure.error}
          {lastFailure.attemptsLeft > 0 &&
            ` — Harbour retries it (${lastFailure.attemptsLeft} ${lastFailure.attemptsLeft === 1 ? "attempt" : "attempts"} left).`}
        </p>
      )}
      <BackUpNowButton demo={demo} label={buttonLabel} />
      <p className="text-xs text-ink-muted">
        Back up now copies the database today, even when the nightly backup is off.{" "}
        <DocsLink href={DOCS_LINKS.backups}>Backups and restore</DocsLink>
      </p>
    </SettingsSection>
  );
}
