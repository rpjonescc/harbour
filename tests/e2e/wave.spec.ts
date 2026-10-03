import { expect, type Page, test } from "@playwright/test";

/** The page wave's front layer (the first wave on /design is the page's, the second its preview). */
const front = (page: Page) =>
  page.locator("[data-wave]").first().locator(".wave-layer[data-front]");

test("the wave is decorative: hidden from assistive tech, behind the content, and clicks pass through it", async ({
  page,
}) => {
  await page.goto("/");
  const wave = page.locator("[data-wave]");
  await expect(wave).toHaveCount(1);
  await expect(wave).toHaveAttribute("aria-hidden", "true");
  await expect(wave).toHaveCSS("pointer-events", "none");
  await expect(wave).toHaveCSS("position", "fixed");
  // Whatever is under a point in the lower half of the screen, it is never the wave.
  const underWave = await page.evaluate(() =>
    [0.2, 0.5, 0.8].map((x) =>
      Boolean(
        document.elementFromPoint(innerWidth * x, innerHeight * 0.85)?.closest("[data-wave]"),
      ),
    ),
  );
  expect(underWave).toEqual([false, false, false]);
  await page.getByRole("link", { name: /^Actions/ }).click();
  await expect(page).toHaveURL(/\/actions/);
  await expect(page.locator("[data-wave]")).toHaveCount(1);
});

test("the wave drifts and bobs when motion is allowed", async ({ page }) => {
  await page.goto("/");
  for (const drift of await page.locator(".wave-drift").all()) {
    await expect(drift).toHaveCSS("animation-name", "wave-drift");
  }
  for (const layer of await page.locator(".wave-layer").all()) {
    await expect(layer).toHaveCSS("animation-name", "wave-bob");
  }
});

test("the ocean is left out of print", async ({ page }) => {
  await page.goto("/");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-wave]")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("[data-wave]")).toBeAttached();
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

  test("the sign-in page has the ocean too, behind the card, without widening the page", async ({
    page,
  }) => {
    await page.goto("/login");
    const wave = page.locator("[data-wave]");
    await expect(wave).toHaveCount(1);
    await expect(wave).toHaveAttribute("aria-hidden", "true");
    await expect(wave).toHaveCSS("pointer-events", "none");
    const button = page.getByRole("button", { name: /passkey/i });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    const onTop = await page.evaluate(
      ([x, y]) => !document.elementFromPoint(x ?? 0, y ?? 0)?.closest("[data-wave]"),
      [(box?.x ?? 0) + 5, (box?.y ?? 0) + 5],
    );
    expect(onTop).toBe(true);
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1] ?? 0);
  });
});

test("a celebrating note makes the front layer ripple once, not in a loop", async ({ page }) => {
  await page.goto("/design"); // its first note example celebrates
  // The bob carries on underneath; the ripple, listed last, plays once.
  await expect(front(page)).toHaveCSS("animation-name", "wave-bob, wave-ripple");
  await expect(front(page)).toHaveCSS("animation-iteration-count", "infinite, 1");
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the wave holds still, and so does the ripple", async ({ page }) => {
    await page.goto("/design");
    for (const drift of await page.locator("[data-wave] .wave-drift").all()) {
      await expect(drift).toHaveCSS("animation-name", "none");
    }
    await expect(front(page)).toHaveCSS("animation-name", "none");
  });
});
