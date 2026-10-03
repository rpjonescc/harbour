// What the Settings page shows. Web-safe: reads config, the jobs and ledger tables, and backup
// file names; key status only, never a secret's value.

import { approvalsWaiting } from "@/lib/actions/board-notices";
import { nextMonthlyRefresh } from "@/lib/agents/refresh-schedule";
import { nextWeeklyRun } from "@/lib/analyst/schedule";
import type { Config } from "@/lib/config";
import { PLATFORM_NAMES } from "@/lib/content/ids";
import { nextDigestRun, nextIdeasRun } from "@/lib/content/schedule";
import { audToMicro } from "@/lib/costs/budget";
import { type Reservation, reservationsBetween } from "@/lib/costs/ledger";
import { type CostMeterView, costMeterView } from "@/lib/costs/meter-view";
import type { Db } from "@/lib/db/client";
import { DIGEST_OFF_REASON, IDEAS_OFF_REASON, NOTE_OFF_REASON } from "@/lib/explain/settings";
import { monthWindow } from "@/lib/format/zoned-time";
import { nextScheduledScans } from "@/lib/jobs/scan-schedule";
import { nextNoteRun, noteEnabled } from "@/lib/note/schedule";
import { nextBackupRun } from "@/lib/ops/backup-schedule";
import { type BackupStatus, backupStatus } from "@/lib/ops/backup-status";
import type { Hue, Product, ProductKind } from "@/lib/products/catalog";
import type { ContentProduct } from "@/lib/products/content";
import { type KeyRow, keyStatusRows } from "./key-status";

export type ScheduleRow = {
  id: "scan" | "analyst" | "refresh" | "backup" | "note" | "digest" | "ideas";
  label: string;
  when: string;
  setting: string;
  /** A plain reason for Off when the row's own setting doesn't explain it; else null. */
  offReason: string | null;
  enabled: boolean;
  next: Date | null;
};

export type SettingsView = {
  products: {
    id: string;
    name: string;
    url: string;
    hue: Hue;
    kind: ProductKind;
    searchConsoleProperty: string | null;
    awaitingApproval: number;
  }[];
  isDemoConfig: boolean;
  schedules: ScheduleRow[];
  keys: KeyRow[];
  budget: CostMeterView & { capMicro: number };
  /** This month's unconfirmed reservations (calls in flight, or left by a crash), read-only. */
  reservations: Reservation[];
  backups: BackupStatus;
  /** HARBOUR_BACKUP_DIR is set (else backups sit next to the database); never the path itself. */
  backupDirSet: boolean;
  timeZone: string;
  /** The content machine's settings, read-only; the key's status stays in `keys`. */
  content: {
    on: boolean;
    screenpipeUrl: string;
    products: { id: string; name: string; terms: string[]; platforms: string[] }[];
  };
};

/** Why the morning note is off: the personality, then its own schedule, else no Claude token. */
function noteOffReason(config: Config): string {
  if (config.HARBOUR_PERSONALITY === "quiet") return NOTE_OFF_REASON.quiet;
  if (config.HARBOUR_SCHEDULED_NOTE === "off") return NOTE_OFF_REASON.schedule;
  return NOTE_OFF_REASON.token;
}

/** Why the activity digest is off, switch first, then Claude, then Screenpipe. */
function digestOffReason(switchOn: boolean, tokenSet: boolean): string {
  if (!switchOn) return DIGEST_OFF_REASON.schedule;
  return tokenSet ? DIGEST_OFF_REASON.screenpipe : DIGEST_OFF_REASON.token;
}

/** Every schedule with whether it is on and its next run, for Settings and the tower. */
export function scheduleRows(config: Config, now: Date, tokenSet: boolean): ScheduleRow[] {
  const zone = config.HARBOUR_TIMEZONE;
  const on = (value: "on" | "off") => value === "on";
  const scans = on(config.HARBOUR_SCHEDULED_SCANS);
  const analyst = on(config.HARBOUR_SCHEDULED_ANALYST);
  const refresh = on(config.HARBOUR_SCHEDULED_RESEARCH);
  const backup = on(config.HARBOUR_SCHEDULED_BACKUP);
  // Without Claude the worker never queues a note, so the row must not promise one.
  const note = noteEnabled(config) && tokenSet;
  const digestSwitch = on(config.HARBOUR_SCHEDULED_DIGEST);
  const keySet = Boolean(config.HARBOUR_SCREENPIPE_API_KEY);
  const digest = digestSwitch && tokenSet && keySet;
  const ideasSwitch = on(config.HARBOUR_SCHEDULED_IDEAS);
  const ideas = ideasSwitch && tokenSet;
  return [
    {
      id: "scan",
      label: "Daily check",
      when: "Every day at 06:00",
      setting: "HARBOUR_SCHEDULED_SCANS",
      offReason: null,
      enabled: scans,
      next: nextScheduledScans(now, zone, scans),
    },
    {
      id: "analyst",
      label: "Weekly report",
      when: "Sundays at 20:00",
      setting: "HARBOUR_SCHEDULED_ANALYST",
      offReason: null,
      enabled: analyst,
      next: nextWeeklyRun(now, zone, analyst),
    },
    {
      id: "refresh",
      label: "Monthly research refresh",
      when: "First Sunday of the month at 21:00",
      setting: "HARBOUR_SCHEDULED_RESEARCH",
      offReason: null,
      enabled: refresh,
      next: nextMonthlyRefresh(now, zone, refresh),
    },
    {
      id: "backup",
      label: "Nightly backup",
      when: "Every night at 03:15",
      setting: "HARBOUR_SCHEDULED_BACKUP",
      offReason: null,
      enabled: backup,
      next: nextBackupRun(now, zone, backup),
    },
    {
      id: "note",
      label: "Morning note",
      when: `Every day at ${config.HARBOUR_NOTE_TIME}`,
      setting: "HARBOUR_SCHEDULED_NOTE",
      offReason: note ? null : noteOffReason(config),
      enabled: note,
      next: nextNoteRun(now, zone, config.HARBOUR_NOTE_TIME, note),
    },
    ...(config.HARBOUR_CONTENT === "on"
      ? [
          {
            id: "digest" as const,
            label: "Activity digest",
            when: `Every day at ${config.HARBOUR_DIGEST_TIME}`,
            setting: "HARBOUR_SCHEDULED_DIGEST",
            offReason: digest ? null : digestOffReason(digestSwitch, tokenSet),
            enabled: digest,
            next: nextDigestRun(now, zone, config.HARBOUR_DIGEST_TIME, digest),
          },
          {
            id: "ideas" as const,
            label: "Content ideas",
            when: "Mondays at 07:00",
            setting: "HARBOUR_SCHEDULED_IDEAS",
            offReason: ideas
              ? null
              : ideasSwitch
                ? IDEAS_OFF_REASON.token
                : IDEAS_OFF_REASON.schedule,
            enabled: ideas,
            next: nextIdeasRun(now, zone, ideas),
          },
        ]
      : []),
  ];
}

/** Everything the Settings overview shows, from `.env`, `harbour.config.json` and the database. */
export function settingsView(
  db: Db,
  products: readonly Product[],
  config: Config,
  now: Date,
  isDemoConfig: boolean,
  tokenSet: boolean,
  contentProducts: readonly ContentProduct[] = [],
): SettingsView {
  const waiting = new Map(approvalsWaiting(db, products).map((w) => [w.productId, w.count]));
  const month = monthWindow(now, config.HARBOUR_TIMEZONE);
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      hue: p.hue,
      kind: p.kind,
      searchConsoleProperty: p.searchConsoleProperty ?? null,
      awaitingApproval: waiting.get(p.id) ?? 0,
    })),
    isDemoConfig,
    schedules: scheduleRows(config, now, tokenSet),
    keys: keyStatusRows(config),
    budget: {
      ...costMeterView(db, config, now),
      capMicro: audToMicro(config.HARBOUR_MONTHLY_BUDGET_AUD),
    },
    reservations: reservationsBetween(db, month.start, month.end),
    backups: backupStatus(db, config, now),
    backupDirSet: config.HARBOUR_BACKUP_DIR !== undefined,
    timeZone: config.HARBOUR_TIMEZONE,
    content: {
      on: config.HARBOUR_CONTENT === "on",
      screenpipeUrl: config.HARBOUR_SCREENPIPE_URL,
      products: contentProducts.map(({ id, name, terms, platforms }) => ({
        id,
        name,
        terms,
        platforms: platforms.map((platform) => PLATFORM_NAMES[platform]),
      })),
    },
  };
}
