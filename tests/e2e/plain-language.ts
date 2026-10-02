import { expect, type Page } from "@playwright/test";

/** The main region's text with every <details> (Technical details) left out. */
function textOutsideDetails(page: Page): Promise<string> {
  return page.getByRole("main").evaluate((main) => {
    const copy = main.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return "";
    for (const details of copy.querySelectorAll("details")) details.remove();
    return copy.textContent ?? "";
  });
}

/**
 * Spec §7's smoke check: no area code as a heading, and no setting names, sub-score keys, markup
 * or header names outside Technical details.
 */
export async function expectPlainLanguage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^(SEO|GEO|AEO)$/ })).toHaveCount(0);
  const text = await textOutsideDetails(page);
  expect(text).not.toMatch(/HARBOUR_[A-Z_]+/);
  expect(text).not.toMatch(/\b(?:seo|geo|aeo)\.[a-zA-Z]/);
  // Rule reasons once leaked tags and header names (spec §5.3, step 3).
  expect(text).not.toMatch(/<\/?[a-z][^>]*>|X-Robots-Tag|JSON-LD/i);
}
