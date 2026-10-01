import { expect, type Locator } from "@playwright/test";

/**
 * Waits until React has hydrated the element (it carries React's props key once its handlers are
 * attached). A click or key press before then is lost, so specs wait for this instead of retrying.
 */
export async function hydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((k) => k.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
}
