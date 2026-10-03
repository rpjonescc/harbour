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
    kind: "news" as const,
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
    const view = settingsView(db, PRODUCTS, config(), NOW, false, true);
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

  it("shows the activity digest only when the content machine is on, with its next run", () => {
    const row = (env: Record<string, string>, tokenSet = true) =>
      settingsView(db, PRODUCTS, config(env), NOW, false, tokenSet).schedules.find(
        (s) => s.id === "digest",
      );
    expect(row({})).toBeUndefined();
    const on = row({ HARBOUR_CONTENT: "on", HARBOUR_SCREENPIPE_API_KEY: "k" });
    expect(on).toMatchObject({
      label: "Activity digest",
      when: "Every day at 05:45",
      setting: "HARBOUR_SCHEDULED_DIGEST",
      enabled: true,
      offReason: null,
    });
    expect(on?.next?.toISOString()).toBe("2026-10-03T04:45:00.000Z");
  });

  it("says why the activity digest is off: its switch, Claude, then Screenpipe", () => {
    const row = (env: Record<string, string>, tokenSet = true) =>
      settingsView(
        db,
        PRODUCTS,
        config({ HARBOUR_CONTENT: "on", ...env }),
        NOW,
        false,
        tokenSet,
      ).schedules.find((s) => s.id === "digest");
    const key = { HARBOUR_SCREENPIPE_API_KEY: "k" };
    expect(row({ ...key, HARBOUR_SCHEDULED_DIGEST: "off" })).toMatchObject({
      enabled: false,
      next: null,
    });
    expect(row({ ...key, HARBOUR_SCHEDULED_DIGEST: "off" })?.offReason).toMatch(/switched off/);
    expect(row(key, false)?.offReason).toMatch(/Claude/);
    expect(row({})?.offReason).toMatch(/Screenpipe/);
    expect(row({})?.next).toBeNull();
  });

  it("shows the Monday ideas run only when content is on, and says why it is off", () => {
    const row = (env: Record<string, string>, tokenSet = true) =>
      settingsView(db, PRODUCTS, config(env), NOW, false, tokenSet).schedules.find(
        (s) => s.id === "ideas",
      );
    expect(row({})).toBeUndefined();
    const on = row({ HARBOUR_CONTENT: "on" });
    expect(on).toMatchObject({
      label: "Content ideas",
      when: "Mondays at 07:00",
      setting: "HARBOUR_SCHEDULED_IDEAS",
      enabled: true,
      offReason: null,
    });
    // Friday 2 October 2026 in London: the next Monday 07:00 BST is 5 October 06:00 UTC.
    expect(on?.next?.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    const off = row({ HARBOUR_CONTENT: "on", HARBOUR_SCHEDULED_IDEAS: "off" });
    expect(off).toMatchObject({ enabled: false, next: null });
    expect(off?.offReason).toMatch(/switched off/);
    expect(row({ HARBOUR_CONTENT: "on" }, false)?.offReason).toMatch(/Claude/);
  });

  it("shows the content settings read-only, with platform names and never a key", () => {
    const acme = { ...PRODUCTS[0], terms: ["acme docs"], platforms: ["linkedin", "x"] } as never;
    const env = { HARBOUR_CONTENT: "on", HARBOUR_SCREENPIPE_API_KEY: "sp-secret-value" };
    const view = settingsView(db, PRODUCTS, config(env), NOW, false, true, [acme]);
    expect(view.content).toEqual({
      on: true,
      screenpipeUrl: "http://127.0.0.1:3030",
      products: [
        { id: "acme-docs", name: "Acme Docs", terms: ["acme docs"], platforms: ["LinkedIn", "X"] },
      ],
    });
    expect(JSON.stringify(view)).not.toContain("sp-secret-value");
    expect(settingsView(db, PRODUCTS, config(), NOW, false, true).content.on).toBe(false);
  });

  it("has no next run for a schedule that is off", () => {
    const off = config({
      HARBOUR_SCHEDULED_SCANS: "off",
      HARBOUR_SCHEDULED_ANALYST: "off",
      HARBOUR_SCHEDULED_RESEARCH: "off",
      HARBOUR_SCHEDULED_BACKUP: "off",
      HARBOUR_SCHEDULED_NOTE: "off",
    });
    const view = settingsView(db, PRODUCTS, off, NOW, false, true);
    expect(view.schedules.every((s) => !s.enabled && s.next === null)).toBe(true);
    expect(view.backups.health).toBe("off");
  });

  it("shows the morning note as off by the personality when it is quiet", () => {
    const view = settingsView(
      db,
      PRODUCTS,
      config({ HARBOUR_PERSONALITY: "quiet" }),
      NOW,
      false,
      true,
    );
    expect(view.schedules.find((s) => s.id === "note")).toMatchObject({
      setting: "HARBOUR_SCHEDULED_NOTE",
      offReason: "Off while the personality is quiet",
      enabled: false,
      next: null,
    });
  });

  it("gives the morning note its own reason when only the schedule is off", () => {
    const view = settingsView(
      db,
      PRODUCTS,
      config({ HARBOUR_SCHEDULED_NOTE: "off" }),
      NOW,
      false,
      true,
    );
    const rows = view.schedules.map((s) => [s.id, s.offReason]);
    expect(rows).toContainEqual(["note", "Off: the morning note schedule is switched off"]);
    expect(rows.filter(([id]) => id !== "note").every(([, reason]) => reason === null)).toBe(true);
  });

  it("says the morning note is off until Claude is connected when there is no token", () => {
    const view = settingsView(db, PRODUCTS, config(), NOW, false, false);
    expect(view.schedules.find((s) => s.id === "note")).toMatchObject({
      offReason: "Off until Claude is connected",
      enabled: false,
      next: null,
    });
    const withToken = settingsView(db, PRODUCTS, config(), NOW, false, true);
    expect(withToken.schedules.find((s) => s.id === "note")).toMatchObject({
      offReason: null,
      enabled: true,
    });
  });

  it("keeps the personality and schedule reasons ahead of the missing token", () => {
    const quiet = config({ HARBOUR_PERSONALITY: "quiet" });
    expect(settingsView(db, PRODUCTS, quiet, NOW, false, false).schedules.at(-1)?.offReason).toBe(
      "Off while the personality is quiet",
    );
  });

  it("counts research targets awaiting approval per product", () => {
    propose("acme-docs", "a");
    propose("acme-docs", "b");
    propose("acme-docs", "c", "approved");
    propose("elsewhere", "d");
    const view = settingsView(db, PRODUCTS, config(), NOW, false, true);
    expect(view.products).toEqual([
      {
        id: "acme-docs",
        name: "Acme Docs",
        url: "https://docs.example.com",
        hue: "amber",
        kind: "product",
        searchConsoleProperty: "sc-domain:example.com",
        awaitingApproval: 2,
      },
      {
        id: "acme-blog",
        name: "Acme Blog",
        url: "https://blog.example.com",
        hue: "teal",
        kind: "news",
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
      true,
    );
    expect(view.isDemoConfig).toBe(true);
    expect(view.backupDirSet).toBe(true);
    expect(view.keys).toHaveLength(9);
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
    expect(settingsView(db, PRODUCTS, config(), NOW, false, true).reservations).toMatchObject([
      { collector: "rankings", productId: "acme-docs", amountMicroAud: 500_000 },
    ]);
  });
});
