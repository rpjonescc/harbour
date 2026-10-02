import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Config, parseConfig } from "@/lib/config";
import { reserveCost } from "@/lib/costs/ledger-write";
import type { Db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import { openTestDb } from "@/tests/helpers/db";
import { settingsView } from "./view";

// London is on BST (UTC+1) on Friday 2 October 2026.
const NOW = new Date("2026-10-02T09:00:00Z");
const PRODUCTS: Product[] = [
  {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber",
    kind: "product" as const,
    searchConsoleProperty: "sc-domain:example.com",
  },
  {
    id: "acme-blog",
    name: "Acme Blog",
    url: "https://blog.example.com",
    hue: "teal",
    kind: "product" as const,
  },
];
let dir: string;
let db: Db;

const config = (env: Record<string, string> = {}): Config =>
  parseConfig({
    HARBOUR_ALLOWED_LOGINS: "owner@example.com",
    HARBOUR_ORIGIN: "https://harbour.example.ts.net",
    HARBOUR_RP_ID: "harbour.example.ts.net",
    HARBOUR_TIMEZONE: "Europe/London",
    HARBOUR_BACKUP_DIR: dir,
    ...env,
  });

function propose(productId: string, key: string, status: "proposed" | "approved" = "proposed") {
  db.insert(proposals)
    .values({
      productId,
      type: "keyword",
      value: { term: key },
      key,
      why: "x",
      status,
      createdAt: NOW,
    })
    .run();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-settings-view-"));
  db = openTestDb();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("settingsView", () => {
  it("lists the four schedules with their next runs", () => {
    const view = settingsView(db, PRODUCTS, config(), NOW, false);
    expect(view.timeZone).toBe("Europe/London");
    expect(view.schedules.map((s) => [s.id, s.setting, s.enabled, s.next?.toISOString()])).toEqual([
      ["scan", "HARBOUR_SCHEDULED_SCANS", true, "2026-10-03T05:00:00.000Z"],
      ["analyst", "HARBOUR_SCHEDULED_ANALYST", true, "2026-10-04T19:00:00.000Z"],
      ["refresh", "HARBOUR_SCHEDULED_RESEARCH", true, "2026-10-04T20:00:00.000Z"],
      ["backup", "HARBOUR_SCHEDULED_BACKUP", true, "2026-10-03T02:15:00.000Z"],
      ["note", "HARBOUR_SCHEDULED_NOTE", true, "2026-10-03T05:30:00.000Z"],
    ]);
    expect(view.schedules.map((s) => [s.label, s.when])).toEqual([
      ["Daily check", "Every day at 06:00"],
      ["Weekly report", "Sundays at 20:00"],
      ["Monthly research refresh", "First Sunday of the month at 21:00"],
      ["Nightly backup", "Every night at 03:15"],
      ["Morning note", "Every day at 06:30"],
    ]);
  });

  it("has no next run for a schedule that is off", () => {
    const off = config({
      HARBOUR_SCHEDULED_SCANS: "off",
      HARBOUR_SCHEDULED_ANALYST: "off",
      HARBOUR_SCHEDULED_RESEARCH: "off",
      HARBOUR_SCHEDULED_BACKUP: "off",
      HARBOUR_SCHEDULED_NOTE: "off",
    });
    const view = settingsView(db, PRODUCTS, off, NOW, false);
    expect(view.schedules.every((s) => !s.enabled && s.next === null)).toBe(true);
    expect(view.backups.health).toBe("off");
  });

  it("shows the morning note as off by the personality when it is quiet", () => {
    const view = settingsView(db, PRODUCTS, config({ HARBOUR_PERSONALITY: "quiet" }), NOW, false);
    expect(view.schedules.find((s) => s.id === "note")).toMatchObject({
      setting: "HARBOUR_SCHEDULED_NOTE",
      offReason: "Off while the personality is quiet",
      enabled: false,
      next: null,
    });
  });

  it("gives the morning note its own reason when only the schedule is off", () => {
    const view = settingsView(db, PRODUCTS, config({ HARBOUR_SCHEDULED_NOTE: "off" }), NOW, false);
    const rows = view.schedules.map((s) => [s.id, s.offReason]);
    expect(rows).toContainEqual(["note", "Off: the morning note schedule is switched off"]);
    expect(rows.filter(([id]) => id !== "note").every(([, reason]) => reason === null)).toBe(true);
  });

  it("counts research targets awaiting approval per product", () => {
    propose("acme-docs", "a");
    propose("acme-docs", "b");
    propose("acme-docs", "c", "approved");
    propose("elsewhere", "d");
    const view = settingsView(db, PRODUCTS, config(), NOW, false);
    expect(view.products).toEqual([
      {
        id: "acme-docs",
        name: "Acme Docs",
        url: "https://docs.example.com",
        hue: "amber",
        searchConsoleProperty: "sc-domain:example.com",
        awaitingApproval: 2,
      },
      {
        id: "acme-blog",
        name: "Acme Blog",
        url: "https://blog.example.com",
        hue: "teal",
        searchConsoleProperty: null,
        awaitingApproval: 0,
      },
    ]);
  });

  it("carries the demo flag, the key rows and the budget", () => {
    const view = settingsView(
      db,
      PRODUCTS,
      config({ HARBOUR_MONTHLY_BUDGET_AUD: "60" }),
      NOW,
      true,
    );
    expect(view.isDemoConfig).toBe(true);
    expect(view.backupDirSet).toBe(true);
    expect(view.keys).toHaveLength(7);
    expect(view.budget).toMatchObject({ state: "no-paid-sources", capMicro: 60_000_000 });
  });

  it("lists this month's unconfirmed reservations", () => {
    const window = {
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-11-01T00:00:00Z"),
    };
    reserveCost(
      db,
      {
        collector: "rankings",
        productId: "acme-docs",
        jobId: null,
        amountMicroAud: 500_000,
        capMicroAud: 60_000_000,
        window,
      },
      NOW,
    );
    expect(settingsView(db, PRODUCTS, config(), NOW, false).reservations).toMatchObject([
      { collector: "rankings", productId: "acme-docs", amountMicroAud: 500_000 },
    ]);
  });
});
