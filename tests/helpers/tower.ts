/** Fixture facts for the tower's pure shapers: everything fine unless a test says otherwise. */
import { join } from "node:path";
import { type Config, parseConfig } from "@/lib/config";
import type { Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import type { ScheduleRow } from "@/lib/settings/view";
import type { SystemFacts } from "@/lib/tower/system-data";

export const t0 = new Date("2026-10-02T09:00:00Z"); // 10:00 on Friday in London
export const LONDON = "Europe/London";
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const ago = (ms: number) => new Date(t0.getTime() - ms);

export const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "acme-blog", name: "Acme Blog" },
];

/** A job row; override any field. */
export function job(over: Partial<Job> = {}): Job {
  return {
    id: 1,
    kind: "daily-note",
    params: { stamp: "2026-10-02" },
    dedupeKey: "k",
    status: "ok",
    requestedBy: null,
    createdAt: ago(HOUR),
    startedAt: ago(HOUR),
    finishedAt: ago(HOUR - MIN),
    heartbeatAt: null,
    cancelRequested: false,
    notBefore: null,
    error: null,
    result: null,
    ...over,
  };
}

export function schedule(
  id: ScheduleRow["id"],
  label: string,
  over: Partial<ScheduleRow> = {},
): ScheduleRow {
  return {
    id,
    label,
    when: "Every day at 06:00",
    setting: "HARBOUR_SCHEDULED_SCANS",
    offReason: null,
    enabled: true,
    next: null,
    ...over,
  };
}

/** Systems where every light is fine (two products checked 4 h ago, backed up at 03:15). */
export function systemFacts(over: Partial<SystemFacts> = {}): SystemFacts {
  return {
    webStartedAt: ago(2 * DAY),
    worker: { lastSeen: ago(20_000), startedAt: ago(2 * DAY), runningJob: false },
    schedules: [
      { row: schedule("scan", "Daily check"), lastRun: { status: "ok", at: ago(4 * HOUR) } },
      {
        row: schedule("analyst", "Weekly report"),
        lastRun: { status: "ok", at: ago(4 * DAY) },
      },
    ],
    checks: PRODUCTS.map((p) => ({
      productId: p.id,
      productName: p.name,
      scannedAt: ago(4 * HOUR),
      scanning: false,
      failedAt: null,
    })),
    backup: {
      enabled: true,
      next: null,
      latest: {
        name: "harbour-2026-10-02.db",
        day: "2026-10-02",
        bytes: 10,
        modifiedAt: ago(6 * HOUR),
      },
      count: 3,
      lastFailure: null,
      lastRetention: null,
      health: "ok",
    },
    brain: {
      sync: { unsaved: 0, unpushed: 0 },
      syncFailed: false,
      recovery: { pending: [], lastError: null },
    },
    notesSavedAt: ago(2 * HOUR),
    failures: [],
    agents: { running: [], queued: [], failedUnretried: [], finishedToday: 3 },
    cost: { state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0 },
    products: PRODUCTS,
    ...over,
  };
}

/** A config for the tower's readers, with its folders under `dir` (a fresh temp folder). */
export function towerConfig(dir: string, env: Record<string, string> = {}): Config {
  return parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "https://harbour.example.com",
    HARBOUR_RP_ID: "harbour.example.com",
    HARBOUR_TIMEZONE: LONDON,
    HARBOUR_DB_PATH: join(dir, "data/harbour.db"),
    HARBOUR_BRAIN_DIR: join(dir, "brain"),
    HARBOUR_BACKUP_DIR: join(dir, "backups"),
    ...env,
  });
}

export const ACME_DOCS: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
  kind: "product",
};

export const PRODUCT_ROWS: Product[] = [
  ACME_DOCS,
  {
    id: "acme-blog",
    name: "Acme Blog",
    url: "https://blog.example.com",
    hue: "teal",
    kind: "news",
  },
];
