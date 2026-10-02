// Fictional Settings data for /design and component tests. Never real products, paths or keys.
import { MICRO_PER_AUD } from "@/lib/costs/budget";
import type { CostMeterView } from "@/lib/costs/meter-view";
import type { BackupHealth, BackupStatus } from "@/lib/ops/backup-status";
import type { SettingsView } from "@/lib/settings/view";

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);

/** Today's cost meter in each state. */
export const EXAMPLE_METERS: { label: string; view: CostMeterView }[] = [
  {
    label: "No paid data",
    view: { state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0 },
  },
  {
    label: "Disconnected, with spend",
    view: { state: "no-paid-sources", spentMicro: A$(1.23), unconfirmedMicro: 0 },
  },
  { label: "No budget", view: { state: "no-budget", spentMicro: 0, unconfirmedMicro: 0 } },
  {
    label: "On track",
    view: {
      state: "ok",
      spentMicro: A$(12.4),
      capMicro: A$(60),
      projectedMicro: A$(31),
      unconfirmedMicro: 0,
    },
  },
  {
    label: "80 % warning",
    view: {
      state: "warn",
      spentMicro: A$(49.5),
      capMicro: A$(60),
      projectedMicro: A$(95.9),
      unconfirmedMicro: 0,
    },
  },
  {
    label: "With unconfirmed spend",
    view: {
      state: "ok",
      spentMicro: A$(20.5),
      capMicro: A$(60),
      projectedMicro: A$(42),
      unconfirmedMicro: A$(0.5),
    },
  },
  {
    label: "Budget reached",
    view: {
      state: "reached",
      spentMicro: A$(60.12),
      capMicro: A$(60),
      projectedMicro: A$(116),
      unconfirmedMicro: 0,
    },
  },
];

export const EXAMPLE_ZONE = {
  now: new Date("2026-10-02T09:00:00Z"),
  timeZone: "Europe/London",
  locale: "en-GB",
};

const healthy: BackupStatus = {
  enabled: true,
  next: new Date("2026-10-03T02:15:00Z"),
  latest: {
    name: "harbour-2026-10-02.db",
    day: "2026-10-02",
    bytes: 12_400_000,
    modifiedAt: new Date("2026-10-02T02:15:40Z"),
  },
  count: 9,
  lastFailure: null,
  lastRetention: {
    jobId: 41,
    at: new Date("2026-10-02T02:16:10Z"),
    status: "ok",
    summary: "Removed 18,240 observations from 11 scans",
  },
  health: "ok",
};

/** One backup status per health state. */
export const EXAMPLE_BACKUPS: Record<BackupHealth, BackupStatus> = {
  ok: healthy,
  "none-yet": { ...healthy, latest: null, count: 0, lastRetention: null, health: "none-yet" },
  failed: {
    ...healthy,
    lastFailure: {
      jobId: 40,
      at: new Date("2026-10-02T03:10:00Z"),
      error: "No space left on device",
      attemptsLeft: 0,
    },
    latest: {
      name: "harbour-2026-10-01.db",
      day: "2026-10-01",
      bytes: 12_300_000,
      modifiedAt: new Date("2026-10-01T02:15:40Z"),
    },
    health: "failed",
  },
  stale: {
    ...healthy,
    latest: {
      name: "harbour-2026-09-28.db",
      day: "2026-09-28",
      bytes: 11_900_000,
      modifiedAt: new Date("2026-09-28T02:15:40Z"),
    },
    health: "stale",
  },
  off: { ...healthy, enabled: false, next: null, health: "off" },
  unreadable: { ...healthy, latest: null, count: null, health: "unreadable" },
};

/** A Settings overview for two fictional products. */
export const EXAMPLE_SETTINGS: SettingsView = {
  products: [
    {
      id: "acme-docs",
      name: "Acme Docs",
      url: "https://docs.example.com",
      hue: "amber",
      searchConsoleProperty: "sc-domain:example.com",
      awaitingApproval: 3,
    },
    {
      id: "acme-blog",
      name: "Acme Blog",
      url: "https://blog.example.com",
      hue: "teal",
      searchConsoleProperty: null,
      awaitingApproval: 0,
    },
  ],
  isDemoConfig: false,
  schedules: [
    {
      id: "scan",
      label: "Daily scan",
      when: "Every day at 06:00",
      setting: "HARBOUR_SCHEDULED_SCANS",
      enabled: true,
      next: new Date("2026-10-03T05:00:00Z"),
    },
    {
      id: "analyst",
      label: "Weekly analyst",
      when: "Sundays at 20:00",
      setting: "HARBOUR_SCHEDULED_ANALYST",
      enabled: true,
      next: new Date("2026-10-04T19:00:00Z"),
    },
    {
      id: "refresh",
      label: "Monthly research refresh",
      when: "First Sunday of the month at 21:00",
      setting: "HARBOUR_SCHEDULED_RESEARCH",
      enabled: false,
      next: null,
    },
    {
      id: "backup",
      label: "Nightly backup",
      when: "Every night at 03:15",
      setting: "HARBOUR_SCHEDULED_BACKUP",
      enabled: true,
      next: new Date("2026-10-03T02:15:00Z"),
    },
    {
      id: "note",
      label: "Morning note",
      when: "Every day at 06:30",
      setting: "HARBOUR_PERSONALITY",
      offValue: "quiet",
      enabled: false,
      next: null,
    },
  ],
  keys: [
    {
      id: "claude",
      label: "Claude token",
      settings: ["HARBOUR_CLAUDE_OAUTH_TOKEN"],
      status: "present",
      usedFor:
        "Agents: research, discovery, the weekly analyst, research refreshes and the morning note",
      inUse: true,
      paid: false,
    },
    {
      id: "search-console",
      label: "Search Console",
      settings: ["HARBOUR_GSC_CREDENTIALS"],
      status: "file-not-found",
      usedFor: "Clicks, impressions and queries from Google Search Console",
      inUse: true,
      paid: false,
    },
    {
      id: "openai",
      label: "OpenAI",
      settings: ["HARBOUR_OPENAI_API_KEY"],
      status: "missing",
      usedFor: "Whether ChatGPT search mentions and cites each product",
      inUse: false,
      paid: true,
    },
  ],
  budget: {
    state: "ok",
    spentMicro: A$(12.4),
    capMicro: A$(60),
    projectedMicro: A$(31),
    unconfirmedMicro: A$(0.5),
  },
  reservations: [
    {
      id: 7,
      createdAt: new Date("2026-10-01T06:02:00Z"),
      collector: "rankings",
      productId: "acme-docs",
      jobId: 38,
      amountMicroAud: A$(0.5),
    },
  ],
  backups: healthy,
  backupDirSet: false,
  timeZone: "Europe/London",
};
