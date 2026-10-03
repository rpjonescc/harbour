import { expect, type Page, test } from "@playwright/test";
import { E2E_TREG_KEY, E2E_TREG_PORT } from "../../playwright.config";
import { expectPlainLanguage } from "./plain-language";

// The worker asks the fake Treg (tests/e2e/fake-treg-server.ts, never the real service) for the
// two products that have searches chosen in tests/fixtures/harbour.config.e2e.json. Scheduled
// scans are off, so the only checks are the ones these specs queue with Run this check now.

const FAKE = `http://127.0.0.1:${E2E_TREG_PORT}`;
test.describe.configure({ mode: "serial" });

const section = (page: Page) => page.getByRole("region", { name: "How the web sees you" });
const runButton = (page: Page) => page.getByRole("button", { name: "Run this check now" });
const steer = (page: Page, mode: string) =>
  page.request.post(`${FAKE}/__mode`, {
    data: { mode },
    headers: { "content-type": "application/json" },
  });

async function requestCheck(page: Page) {
  const button = runButton(page);
  // A click before hydration is lost; a repeat click is harmless (one check per product queues).
  await expect(async () => {
    await button.click();
    await expect(button).toBeDisabled({ timeout: 1_000 });
  }).toPass();
}

test("a product with no searches chosen says so and offers no check", async ({ page }) => {
  await page.goto("/products/acme-docs");
  await expect(section(page)).toContainText("No searches chosen yet");
  await expect(runButton(page)).toHaveCount(0);
});

test("Run this check now fills the section with links, positions and the AI check", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await steer(page, "ok");
  await page.goto("/products/fern-and-field");
  await expect(section(page)).toContainText("Not checked yet.");
  await requestCheck(page);
  // The page refreshes itself every 10 s while the check is queued or running.
  await expect(section(page)).toContainText("4 sites link to you (your own pages not counted)", {
    timeout: 90_000,
  });

  await expect(section(page)).toContainText("ChatGPT named you in 1 of 1 answer");
  await expect(section(page)).toContainText(
    "sites it cited most: news.example.org, reviews.example.net",
  );
  const row = (query: string) => section(page).getByRole("listitem").filter({ hasText: query });
  await expect(row("fern and field")).toContainText("Position 4");
  await expect(row("garden gifts near me")).toContainText("Position 4");
  // Never a made-up number for a search the site isn't found for.
  await expect(row("plant shop brisbane")).toContainText("Not in the top 30");
  await expect(row("plant shop brisbane")).not.toContainText(/Position \d/);
  await expect(section(page).getByText(/Last checked .+ 20\d\d\./)).toBeVisible();
  // Plain text only: nothing in the section is a link, and the key never reaches the page.
  await expect(section(page).getByRole("link")).toHaveCount(0);
  expect(await page.content()).not.toContain(E2E_TREG_KEY);
  await expectPlainLanguage(page);

  // A second check straight away is refused, in words, and queues nothing.
  await expect(section(page)).toContainText("checked in the last 6 hours");
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(section(page).getByRole("status")).toContainText("checked in the last 6 hours");
});

test("an empty balance pauses the check and the section says so", async ({ page }) => {
  test.setTimeout(120_000);
  await steer(page, "balance");
  try {
    await page.goto("/products/lighthouse-cafe");
    await expect(section(page)).toContainText("Not checked yet.");
    await requestCheck(page);
    await expect(section(page)).toContainText("Paused: balance or key", { timeout: 90_000 });
    await expect(section(page)).not.toContainText(/\d+ sites? link/);
    await expectPlainLanguage(page);
  } finally {
    await steer(page, "ok");
  }
});

test("the design page shows every state, with unique names", async ({ page }) => {
  await page.goto("/design");
  const regions = page.getByRole("region", { name: "How the web sees you" });
  expect(await regions.count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByText("Paused: balance or key").first()).toBeVisible();
  await expect(page.getByText("Skipped: this month's budget is used up").first()).toBeVisible();
});
