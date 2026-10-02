import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Opens a run's step-by-step log (Technical details, closed by default but remembered once the
 * owner has opened it) and returns its activity list.
 */
export async function openRunLog(page: Page): Promise<Locator> {
  const activity = page.getByRole("list", { name: "Run activity" });
  const summary = page.getByText(/Technical details \(step-by-step log of the run\)/);
  await expect(async () => {
    if (!(await activity.isVisible())) await summary.click();
    await expect(activity).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return activity;
}
