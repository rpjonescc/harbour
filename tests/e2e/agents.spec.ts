import { expect, test } from "@playwright/test";
import { E2E_LOGIN, E2E_ORIGIN } from "../../playwright.config";
import { openRunLog } from "./run-log";

// The worker runs tests/fixtures/fake-claude.mjs instead of the real CLI; the brain is the
// git-backed copy made by tests/e2e/prepare.ts.

test("a research run streams activity, commits, and the document appears in the brain", async ({
  page,
}) => {
  await page.goto("/agents");
  await page.getByRole("button", { name: "Run research: Glossary" }).click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  const activity = await openRunLog(page);
  await expect(activity.getByText("Searching: fake research query")).toBeVisible({
    timeout: 30_000,
  });
  await expect(activity.getByText("Committed 1 file(s)")).toBeVisible({ timeout: 30_000 });
  await expect(activity.getByText("Pushed to the brain repository")).toBeVisible();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();

  await page.goto("/brain/research/glossary.md");
  await expect(
    page.getByRole("heading", { level: 1, name: "Fake research/glossary.md" }),
  ).toBeVisible();
});

test("discovery proposals can be approved", async ({ page }) => {
  await page.goto("/agents");
  await page.getByRole("button", { name: "Find ideas for Acme Docs" }).click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  await openRunLog(page);
  await expect(page.getByText("Imported 3 proposal(s); 0 already known")).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/settings/products/acme-docs");
  const keywords = page.getByRole("region", { name: "Keywords" });
  await expect(keywords.getByText("1 proposed · 0 approved · 0 rejected")).toBeVisible();
  await keywords.getByRole("button", { name: 'Approve keyword "example widgets"' }).click();
  await expect(keywords.getByRole("status")).toHaveText('Approved keyword "example widgets"');
  await expect(keywords.getByText("0 proposed · 1 approved · 0 rejected")).toBeVisible();
});

test("agent API requires a session", async ({ playwright }) => {
  // Identity header but no session cookie (the config's storage state would add one).
  const request = await playwright.request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "Tailscale-User-Login": E2E_LOGIN },
  });
  const response = await request.get("/api/agents/1");
  expect(response.status()).toBe(401);
  await request.dispose();
});
