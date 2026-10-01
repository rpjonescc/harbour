import { expect, type Page, test } from "@playwright/test";
import { E2E_SITE_PORT } from "../../playwright.config";

// The worker scans the fictional Acme Docs site served by tests/e2e/fixture-site.ts
// (tests/fixtures/sites/acme-docs): /about has no title, / and /about link to a missing page.
// Scheduled scans are off, so the only scan is the one these specs queue with Scan now.

const SITE = `http://127.0.0.1:${E2E_SITE_PORT}`;

test.describe.configure({ mode: "serial" });

/** A score tile in the product header, e.g. "SEO" (headline name "Search engines"). */
const scoreTile = (page: Page, name: string) =>
  page.getByRole("term").filter({ hasText: name }).locator("..");

test("Scan now runs a scan and the product page shows its results", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/products/acme-docs");
  await expect(page.getByText("Not scanned yet")).toBeVisible();
  const scanNow = page.getByRole("button", { name: "Scan now" });
  // A click before hydration is lost; a repeat click is harmless (one scan per product queues).
  await expect(async () => {
    await scanNow.click();
    await expect(scanNow).toBeDisabled({ timeout: 1_000 });
  }).toPass();
  // The page refreshes itself every 10 s while the scan is queued or running.
  await expect(page.getByText(/^Last scan .+\.$/)).toBeVisible({ timeout: 90_000 });
  await expect(scanNow).toBeEnabled();

  for (const [area, name] of [
    ["SEO", "Search engines"],
    ["GEO", "AI assistants"],
    ["AEO", "Direct answers"],
  ] as const) {
    await expect(scoreTile(page, name)).toContainText(new RegExp(`${area}.*${name}\\s*\\d+`));
  }

  const breakdown = page.getByRole("tabpanel", { name: "SEO" });
  await expect(breakdown.getByRole("heading", { name: "Technical health" })).toBeVisible();
  // Evidence for a source that is not set up says so rather than scoring it zero.
  await expect(breakdown.getByText("Not connected").first()).toBeVisible();

  const issues = page.getByRole("region", { name: "Issues" });
  const noTitle = issues.getByRole("article", { name: "1 page has no title" });
  await noTitle.getByText("Where").click();
  await expect(noTitle.getByText(`${SITE}/about`)).toBeVisible();
  const broken = issues.getByRole("article", { name: "1 linked page is broken" });
  await broken.getByText("Where").click();
  await expect(broken.getByText(`${SITE}/missing (HTTP 404)`, { exact: false })).toBeVisible();

  const pages = page.getByRole("region", { name: "Pages" }).getByRole("table");
  await expect(pages.getByRole("row", { name: /\/about\b.*No title/ })).toBeVisible();
  await expect(pages.getByRole("row", { name: /\/missing\b.*404.*HTTP 404/ })).toBeVisible();
  await expect(pages.getByRole("row", { name: /\/guides\/faq\b/ })).toBeVisible();

  const searchConsole = page.getByRole("region", { name: "Search Console" });
  await expect(searchConsole.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(
    searchConsole.getByRole("link", { name: /How to connect Search Console/ }),
  ).toHaveAttribute("href", /#connect-search-console$/);
  for (const name of ["AI engines", "Rankings"]) {
    const panel = page.getByRole("region", { name });
    await expect(panel.getByText("Not connected", { exact: true })).toBeVisible();
    await expect(panel.getByRole("link", { name: /What the scores use today/ })).toBeVisible();
  }
});

test("keyboard: the score breakdown tabs move with the arrow keys", async ({ page }) => {
  await page.goto("/products/acme-docs");
  const tabs = page.getByRole("tablist", { name: "Score breakdown" });
  const tab = (name: string) => tabs.getByRole("tab", { name });
  await expect(tab("SEO")).toHaveAttribute("aria-selected", "true");
  // Keys pressed before hydration are lost; a click that selects GEO shows the tabs are live.
  await expect(async () => {
    await tab("GEO").click();
    await expect(tab("GEO")).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
  await page.keyboard.press("ArrowLeft");
  await expect(tab("SEO")).toBeFocused();
  await expect(tab("SEO")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab("GEO")).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "GEO" }).getByRole("heading", { name: "llms.txt" }),
  ).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "SEO" })).toBeHidden();
  await page.keyboard.press("End");
  await expect(tab("AEO")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab("SEO")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tab("AEO")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tab("SEO")).toBeFocused();
  // One tab stop: Tab leaves the tab list for the selected panel.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel", { name: "SEO" })).toBeFocused();
});

test("Sources lists each source's last run and how to connect the missing ones", async ({
  page,
}) => {
  await page.goto("/settings/sources");
  await expect(page.getByText(/HARBOUR_SCHEDULED_SCANS=off/)).toBeVisible();

  const connections = page.getByRole("list", { name: "Connections" });
  for (const [name, link] of [
    ["PageSpeed", "Connect PageSpeed"],
    ["Search Console", "Connect Search Console"],
  ] as const) {
    const row = connections.getByRole("listitem").filter({ hasText: name });
    await expect(row).toContainText("Not connected");
    await expect(row.getByRole("link", { name: new RegExp(link) })).toBeVisible();
  }

  const acme = page.getByRole("region", { name: "Acme Docs" });
  await expect(acme).toContainText(/Last scan .+ \(ok\)/);
  const run = (name: string) => acme.getByRole("row", { name: new RegExp(`^${name}`) });
  await expect(run("Crawler")).toContainText("ok");
  await expect(run("Readiness")).toContainText("ok");
  await expect(run("PageSpeed")).toContainText("not connected");
  await expect(run("Search Console")).toContainText("not connected");
  await expect(page.getByRole("region", { name: "Fern & Field" })).toContainText("Never scanned");
});

test("Today shows the real scores instead of the sample", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/· last scan /)).toBeVisible();
  await expect(page.getByText("Sample data")).toHaveCount(0);
  const table = page.getByRole("table", { name: "Visibility scores by product" });
  const acme = table.getByRole("row", { name: /Acme Docs/ });
  for (const cell of await acme
    .getByRole("cell")
    .all()
    .then((cells) => cells.slice(0, 3))) {
    await expect(cell).toHaveText(/^\d+/);
  }
  // Products not scanned yet show a gap, never a zero.
  await expect(
    table
      .getByRole("row", { name: /Fern & Field/ })
      .getByRole("cell")
      .first(),
  ).toHaveText(/no score/);
  // Real actions link to the product's issues (sample ones do not).
  await expect(page.getByRole("link", { name: "1 page has no title" })).toHaveAttribute(
    "href",
    "/products/acme-docs#issues",
  );
});
