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

/** File names, markup and bot names that don't belong in a card title (spec §5.2, step 4). */
export const RULE_JARGON =
  /robots\.txt|llms\.txt|noindex|meta description|structured data|JSON-LD|schema|Preferred Sources|\b\w+Bot\b/i;

/** Every issue card on the page is titled in plain words. */
export async function expectPlainIssueTitles(page: Page): Promise<void> {
  const titles = await page.getByRole("article").getByRole("heading").allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) expect(title).not.toMatch(RULE_JARGON);
}

/**
 * Spec §7's smoke check: no area code as a heading, and no setting names, sub-score keys, markup
 * or header names outside Technical details.
 */
export async function expectPlainLanguage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^(SEO|GEO|AEO)$/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^(SEO|GEO|AEO)$/ })).toHaveCount(0);
  const text = await textOutsideDetails(page);
  expect(text).not.toMatch(/HARBOUR_[A-Z_]+/);
  expect(text).not.toMatch(/\b(?:seo|geo|aeo)\.[a-zA-Z]/);
  // Rule reasons once leaked tags and header names (spec §5.3, step 3).
  expect(text).not.toMatch(/<\/?[a-z][^>]*>|X-Robots-Tag|JSON-LD/i);
}
