import { expect, type Page, test } from "@playwright/test";

/** True when the page scrolls sideways (anything wider than the screen). */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the sidebar is a top bar with a Menu button that opens, closes on Escape and returns focus", async ({
    page,
  }) => {
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Menu" });
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();

    // Keyboard only: open with Enter, follow a link, and the menu is closed on the new page.
    await page.keyboard.press("Enter");
    await nav.getByRole("link", { name: /^Actions/ }).click();
    await expect(page).toHaveURL(/\/actions/);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  for (const path of ["/", "/actions"]) {
    test(`${path} has no sideways scrolling, and the content gets the full width`, async ({
      page,
    }) => {
      await page.goto(path);
      expect(await scrollsSideways(page)).toBe(false);
      const main = await page.locator("main").boundingBox();
      expect(main?.width).toBeGreaterThan(380);
    });
  }
});

test("on a desktop the sidebar is the left rail, with no Menu button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});
