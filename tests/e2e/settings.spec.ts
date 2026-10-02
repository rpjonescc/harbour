import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import { openDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { E2E_DB, E2E_LOGIN, E2E_ORIGIN } from "../../playwright.config";
import { hydrated } from "./hydration";

// Runs last: Back up now and the research refresh share the worker's queue with every earlier
// run. Every schedule is off in the E2E env, so only these clicks queue work. With
// HARBOUR_BACKUP_DIR unset, backups go to `data/e2e/backups` (next to the E2E database), which
// tests/e2e/prepare.ts recreates on every run.

test.describe.configure({ mode: "serial" });

const BACKUP_DIR = join(E2E_DB, "..", "backups");
const FAKE_TOKEN = "e2e-fake-token";
// The server's day: E2E leaves HARBOUR_TIMEZONE unset, so it is this machine's zone.
const today = () => isoDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date());

const settingsRegion = (page: Page, name: string) =>
  page.getByRole("main").getByRole("region", { name, exact: true });

test("the sidebar marks Settings, then only Devices on the devices page", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator("aside");
  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  const current = sidebar.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText("Settings");

  await page.goto("/settings/devices");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText("Devices");
});

test("Products lists the three products and their research approvals", async ({ page }) => {
  await page.goto("/settings");
  const products = settingsRegion(page, "Products");
  for (const name of ["Acme Docs", "Lighthouse Café", "Fern & Field"]) {
    const item = products.getByRole("listitem").filter({ hasText: name });
    await expect(item).toContainText("No Search Console property");
  }
  // agents.spec.ts imported three discovery proposals for Acme Docs and approved one.
  const acme = products.getByRole("listitem").filter({ hasText: "Acme Docs" });
  await acme.getByRole("link", { name: "2 research targets waiting for approval" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Acme Docs — research targets" }),
  ).toBeVisible();

  await page.goto("/settings");
  for (const name of ["Lighthouse Café", "Fern & Field"]) {
    const item = products.getByRole("listitem").filter({ hasText: name });
    await expect(item).toContainText("No research targets waiting");
  }
  const more = settingsRegion(page, "More settings");
  for (const name of ["Acme Docs", "Lighthouse Café", "Fern & Field"]) {
    const link = more.getByRole("link", { name: `${name} research targets` });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/settings\/products\/[a-z-]+$/);
    expect((await page.request.get(href ?? "")).status()).toBe(200);
  }
});

test("every schedule is off in the E2E environment", async ({ page }) => {
  await page.goto("/settings");
  const table = page.getByRole("table", { name: "What runs on a schedule and when it runs next" });
  const rows = [
    ["Daily check", "HARBOUR_SCHEDULED_SCANS"],
    ["Weekly analyst", "HARBOUR_SCHEDULED_ANALYST"],
    ["Monthly research refresh", "HARBOUR_SCHEDULED_RESEARCH"],
    ["Nightly backup", "HARBOUR_SCHEDULED_BACKUP"],
    ["Morning note", "HARBOUR_SCHEDULED_NOTE"],
  ];
  for (const [label, setting] of rows) {
    const row = table.getByRole("row", { name: new RegExp(`^${label}`) });
    await expect(row.getByRole("cell").nth(1)).toHaveText("Off");
    await expect(row).toContainText(`Off — ${setting}=off`);
  }
});

test("API keys show status only, never a value", async ({ page }) => {
  const response = await page.goto("/settings");
  const table = page.getByRole("table", { name: "API keys and whether each is set" });
  const status = (label: string) =>
    table
      .getByRole("row", { name: new RegExp(`^${label}`) })
      .getByRole("cell")
      .last();
  await expect(status("Claude token")).toHaveText("Present");
  await expect(status("PageSpeed Insights")).toHaveText("Missing");
  await expect(status("DataForSEO")).toHaveText("Missing");
  // The HTML (including the serialised server components) never carries the token.
  expect(await response?.text()).not.toContain(FAKE_TOKEN);
  expect(await page.content()).not.toContain(FAKE_TOKEN);
});

test("no budget means no paid calls, on Settings and Today", async ({ page }) => {
  await page.goto("/settings");
  const budget = settingsRegion(page, "Budget");
  await expect(budget.getByText("A$0.00 — no paid calls allowed")).toBeVisible();
  await expect(budget.getByText(/^No paid data connected/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("main").getByText(/^No paid data connected/)).toBeVisible();
});

test("keyboard: Tab reaches the Settings links and Back up now with visible focus", async ({
  page,
}) => {
  await page.goto("/settings");
  const backUp = page.getByRole("button", { name: "Back up now" });
  await hydrated(backUp);
  await page.getByRole("main").focus();
  const stops: string[] = [];
  // Bounded walk: every link and button on the page is well under 40 stops.
  for (let i = 0; i < 40 && !stops.includes("Back up now"); i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
        visible: el.matches(":focus-visible") && style.outlineStyle !== "none",
        width: style.outlineWidth,
      };
    });
    if (!focused) continue;
    expect(focused.visible, `visible focus on "${focused.name}"`).toBe(true);
    expect(focused.width).not.toBe("0px");
    stops.push(focused.name);
  }
  expect(stops).toContain("2 research targets waiting for approval");
  expect(stops).toContain("Back up now");
  await expect(backUp).toBeFocused();
  await page.keyboard.press("Tab");
  // Past the button: the backup docs link, then the More settings links.
  await expect(page.getByRole("link", { name: "Backups and restore" })).toBeFocused();
});

test("Settings renders in light and dark", async ({ page }) => {
  await page.goto("/settings");
  const toggle = page.getByRole("button", { name: /^Theme: / });
  await hydrated(toggle);
  for (const theme of ["light", "dark"]) {
    await toggle.click();
    await expect(toggle).toHaveText(`Theme: ${theme}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(settingsRegion(page, "Backups")).toBeVisible();
  }
});

test("Back up now writes a verified backup, then retention runs", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/settings");
  const backups = settingsRegion(page, "Backups");
  await expect(backups.getByText("No backup yet", { exact: true })).toBeVisible();
  const backUp = backups.getByRole("button", { name: "Back up now" });
  await hydrated(backUp);
  await backUp.click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Nightly backup: ${today()}`);
  const activity = page.getByRole("list", { name: "Run activity" });
  await expect(
    activity.getByText(/^Backup verified: .* MB, .* pages in .* s; 1 kept$/),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Finished", { exact: true })).toBeVisible();

  const latest = openDb(E2E_DB).select().from(auditLog).orderBy(desc(auditLog.id)).get();
  expect(latest).toMatchObject({ login: E2E_LOGIN, event: "backup_requested" });
  // Only into the E2E data folder, readable by the owner alone.
  const file = `harbour-${today()}.db`;
  expect(readdirSync(BACKUP_DIR)).toEqual([file]);
  expect(statSync(join(BACKUP_DIR, file)).mode & 0o777).toBe(0o600);
  expect(statSync(BACKUP_DIR).mode & 0o777).toBe(0o700);

  // The verified backup queues retention; the scans so far are far below the 30 kept.
  await page.goto("/agents");
  await page
    .getByRole("table", { name: "Agent runs" })
    .getByRole("link", { name: `Retention: ${today()}` })
    .click();
  await expect(activity.getByText(/^No old checks to prune \(newest 30 kept/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Finished", { exact: true })).toBeVisible();

  await page.goto("/settings");
  await expect(backups.getByText("1 of 14 kept")).toBeVisible();
  await expect(backups.getByText(/· \d+\.\d MB$/)).toBeVisible();
  await expect(backups.getByRole("link", { name: /No old checks to prune/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("main").getByText(/backup/i)).toHaveCount(0);
});

test("Refresh stale research rewrites the oldest document with today's date", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/agents");
  const refresh = page.getByRole("button", { name: "Refresh stale research" });
  await hydrated(refresh);
  await refresh.click();
  await expect(page.getByRole("status").filter({ hasText: /^Queued/ })).toHaveText(
    /^Queued [123] refresh(es)?$/,
  );
  // Newest first: the last "Refresh:" link is the first one queued (oldest document first).
  const runs = page.getByRole("table", { name: "Agent runs" });
  await runs
    .getByRole("link", { name: /^Refresh: / })
    .last()
    .click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  const activity = page.getByRole("list", { name: "Run activity" });
  await expect(activity.getByText("Committed 1 file(s)")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Finished", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Files changed is rendered by the server once the run has committed.
  await page.reload();
  const files = page.getByRole("heading", { level: 2, name: "Files changed" });
  const changed = page.locator("section", { has: files }).getByRole("link");
  await expect(changed).toHaveCount(1);
  await changed.click();
  await expect(page.getByText(`Researched ${today()}`, { exact: true })).toBeVisible();
});

test("the backup API needs a session and a same-origin request", async ({ page, playwright }) => {
  const anonymous = await playwright.request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "Tailscale-User-Login": E2E_LOGIN },
  });
  const unauthenticated = await anonymous.post("/api/backups", {
    headers: { Origin: E2E_ORIGIN },
    data: {},
  });
  expect(unauthenticated.status()).toBe(401);
  await anonymous.dispose();

  const crossSite = await page.request.post("/api/backups", {
    headers: { Origin: "https://evil.example.com" },
    data: {},
  });
  expect(crossSite.status()).toBe(403);
  // Neither request queued a backup.
  const requested = openDb(E2E_DB)
    .select()
    .from(auditLog)
    .where(eq(auditLog.event, "backup_requested"))
    .all();
  expect(requested).toHaveLength(1);
});
