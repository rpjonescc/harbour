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

test("the wave drifts when motion is allowed", async ({ page }) => {
  await page.goto("/");
  for (const drift of await page.locator(".wave-drift").all()) {
    await expect(drift).toHaveCSS("animation-name", "wave-drift");
  }
});

test("a celebrating note makes the front layer ripple once, not in a loop", async ({ page }) => {
  await page.goto("/design"); // its first note example celebrates
  await expect(front(page)).toHaveCSS("animation-name", "wave-ripple");
  await expect(front(page)).toHaveCSS("animation-iteration-count", "1");
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
