import { expect, type Page, test } from "@playwright/test";
import { isoWeekLabel } from "@/lib/analyst/week";
import { isoDateIn } from "@/lib/format/date";
import { hydrated } from "./hydration";
import { openRunLog } from "./run-log";

// The worker runs tests/fixtures/fake-claude.mjs: each weekly run writes the report and one
// suggestion for Acme Docs. Runs last, after actions.spec.ts has counted the board.

test.describe.configure({ mode: "serial" });

const SUGGESTION = "Answer the top buyer question on the home page";
// The server's week: E2E leaves HARBOUR_TIMEZONE unset, so it is this machine's zone.
const week = () =>
  isoWeekLabel(isoDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date()));

/** Runs the weekly report from the Agents page and waits for the run to finish. */
async function runWeeklyReport(page: Page) {
  await page.goto("/agents");
  const run = page.getByRole("button", { name: "Write this week's report now" });
  await hydrated(run);
  await run.click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  const activity = await openRunLog(page);
  await expect(activity.getByText("Committed 2 file(s)")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Done", { exact: true })).toBeVisible({ timeout: 30_000 });
  return activity;
}

test("Writing this week's report writes the report and suggests an action", async ({ page }) => {
  test.setTimeout(120_000);
  const activity = await runWeeklyReport(page);
  await expect(activity.getByText("Imported 1 action(s); 0 already known")).toBeVisible();

  await page.goto(`/brain/reports/weekly/${week()}.md`);
  await expect(
    page.getByRole("heading", { level: 1, name: `Fake reports/weekly/${week()}.md` }),
  ).toBeVisible();

  await page.goto("/actions?view=list&product=acme-docs&status=suggested");
  const suggestion = page.getByRole("article", { name: SUGGESTION });
  await expect(suggestion).toContainText("Suggested by the weekly report");
  await expect(suggestion.getByRole("button", { name: `Accept: ${SUGGESTION}` })).toBeVisible();
});

test("a second run in the same week suggests nothing it already suggested", async ({ page }) => {
  test.setTimeout(120_000);
  const activity = await runWeeklyReport(page);
  await expect(activity.getByText("Imported 0 action(s); 1 already known")).toBeVisible();
  await page.goto("/actions?view=list&product=acme-docs&status=suggested");
  await expect(page.getByRole("article", { name: SUGGESTION })).toHaveCount(1);
});
