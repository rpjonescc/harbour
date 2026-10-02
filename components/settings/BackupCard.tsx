import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";
import { JOB_STATUS_PHRASE } from "@/lib/explain/agents";
import { BACKUP_HEALTH_LABEL } from "@/lib/explain/backups";
import { SETTINGS_PURPOSE } from "@/lib/explain/settings";
import { formatShortDateTime } from "@/lib/format/date";
import { BACKUPS_KEPT } from "@/lib/ops/backup-files";
import type { BackupHealth, BackupStatus } from "@/lib/ops/backup-status";
import { BackUpNowButton } from "./BackUpNowButton";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const TONE: Record<BackupHealth, "accent" | "warn" | "neutral"> = {
  ok: "accent",
  "none-yet": "neutral",
  failed: "warn",
  stale: "warn",
  off: "neutral",
  unreadable: "warn",
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

/** Backup health, the newest copy, what was last tidied, and Back up now. */
export function BackupCard(props: Props) {
  const { backups, backupDirSet, timeZone, locale, section, demo = false, buttonLabel } = props;
  const at = (date: Date) => formatShortDateTime(date, timeZone, locale);
  const { latest, lastFailure, lastRetention } = backups;
  // Several cards share /design: the topic tells their Technical details apart.
  const which = buttonLabel ? ` (${buttonLabel})` : "";
  return (
    <SettingsSection
      {...section}
      title="Backups"
      purpose={SETTINGS_PURPOSE.backups}
      aside={<Tag tone={TONE[backups.health]}>{BACKUP_HEALTH_LABEL[backups.health]}</Tag>}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {backups.count === null ? (
          <>
            <dt className="text-ink-muted">Backups</dt>
            <dd>Harbour can't check your spare copies. Check the folder's permissions.</dd>
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
              {backups.count} of {BACKUPS_KEPT}
            </dd>
          </>
        )}
        <dt className="text-ink-muted">Saved in</dt>
        <dd>{backupDirSet ? "A folder you chose" : "A backups folder next to the database"}</dd>
        <dt className="text-ink-muted">Old data</dt>
        <dd>
          {lastRetention ? (
            <Link href={`/agents/${lastRetention.jobId}`} className={LINK}>
              {at(lastRetention.at)}:{" "}
              {lastRetention.summary ?? JOB_STATUS_PHRASE[lastRetention.status]}
            </Link>
          ) : (
            "Not tidied yet. That happens after each backup."
          )}
        </dd>
      </dl>
      {lastFailure && (
        <div className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink">
          <p>
            <Link href={`/agents/${lastFailure.jobId}`} className={LINK}>
              The backup on {at(lastFailure.at)} didn't finish
            </Link>
            . Your live data is fine.
            {lastFailure.attemptsLeft > 0 &&
              ` Harbour tries again (${lastFailure.attemptsLeft} ${lastFailure.attemptsLeft === 1 ? "try" : "tries"} left).`}
          </p>
          <TechnicalDetails
            id="backup-failure"
            topic={`what Harbour recorded about the failed backup${which}`}
          >
            <p>{lastFailure.error}</p>
          </TechnicalDetails>
        </div>
      )}
      <BackUpNowButton demo={demo} label={buttonLabel} />
      <TechnicalDetails id="backup-setup" topic={`where backups go and how to change it${which}`}>
        <p>
          Backups go to <code className="font-mono">HARBOUR_BACKUP_DIR</code> when it is set in{" "}
          <code className="font-mono">.env</code>, otherwise next to the database. Back up now
          copies the database today, even when nightly backups are off.{" "}
          <DocsLink href={DOCS_LINKS.backups}>Backups and restore</DocsLink>
        </p>
      </TechnicalDetails>
    </SettingsSection>
  );
}
