import { expect, type Page, test } from "@playwright/test";
import { addIsoDays, formatIsoDay } from "@/lib/format/date";
import { E2E_LOGIN, E2E_ORIGIN } from "../../playwright.config";
import { hydrated } from "./hydration";
import { expectPlainLanguage } from "./plain-language";
import { CAFE, GEO_EVIDENCE, SUGGESTED, seedActions } from "./seed-actions";

// Runs after scans.spec.ts: Acme Docs has the rule actions its scan opened. The seed adds a
// scored scan of Lighthouse Café (rule actions "No guide to your site for AI assistants", "Your site opts out of AI training" and
// "Your questions and answers aren't labelled for Google and AI") and two suggestions from the weekly analyst.

test.describe.configure({ mode: "serial" });
test.beforeAll(() => seedActions());

const CAFE_BOARD = `/actions?product=${CAFE.id}`;
/** E2E runs with the default locale. */
const LOCALE = "en-US";

/** A card on the board, by title and product (two products can share a rule's title). */
const card = (page: Page, title: string, product = CAFE.name) =>
  page.getByRole("article", { name: title, exact: true }).filter({ hasText: product });

/** The board header's counts: "3 to do · 1 in progress · 2 new ideas". */
async function headerCounts(page: Page) {
  const text = await page.getByText(/^\d+ to do · \d+ in progress · \d+ new ideas?$/).textContent();
  const [open = 0, inProgress = 0, suggested = 0] = (text?.match(/\d+/g) ?? []).map(Number);
  return { open, inProgress, suggested, active: open + inProgress };
}

const technical = (title: string) =>
  `Technical details (evidence, source and the prompt for Claude: ${title})`;
/** Opens a card's Technical details unless the owner's remembered choice already has. */
async function openTechnical(page: Page, title: string) {
  const details = card(page, title).locator("details", { hasText: "Technical details" });
  if (!(await details.evaluate((el: HTMLDetailsElement) => el.open))) {
    await details.getByText("Technical details").click();
  }
  return details;
}

/** Clicks a status button once the card is hydrated, then waits for the card's new tag. */
async function changeStatus(page: Page, title: string, button: string, tag: string | RegExp) {
  const target = card(page, title).getByRole("button", {
    name: `${button}: ${title}`,
    exact: true,
  });
  await hydrated(target);
  await target.click();
  await expect(
    card(page, title).getByText(tag, typeof tag === "string" ? { exact: true } : {}),
  ).toBeVisible();
}

test("the sidebar counts open actions and the board groups them, biggest wins first", async ({
  page,
}) => {
  await page.goto("/actions");
  const { active } = await headerCounts(page);
  // Acme Docs' two scan issues and the café's three rule actions are all open.
  expect(active).toBeGreaterThanOrEqual(5);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Actions/ }),
  ).toHaveAccessibleName(new RegExp(`^Actions\\s*${active} open actions$`));

  await expect(card(page, "1 page is missing a title", "Acme Docs")).toBeVisible();
  await expect(card(page, "1 page you link to can't be found", "Acme Docs")).toBeVisible();
  for (const title of [
    "No guide to your site for AI assistants",
    "Your site opts out of AI training",
    "Your questions and answers aren't labelled for Google and AI",
  ])
    await expect(card(page, title)).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText(
    "Big wins",
  );
  // Suggestions wait outside the default view.
  await expect(card(page, SUGGESTED.geo)).toHaveCount(0);
  await expect(page.getByText(/^\d+ to do · \d+ in progress · \d+ new ideas?$/)).toBeVisible();
  await expectPlainLanguage(page);
  const acme = card(page, "1 page is missing a title", "Acme Docs");
  await expect(acme.getByText("Big win", { exact: true })).toBeVisible();
  await expect(acme.getByText("Waiting for you")).toBeVisible();

  await page.goto("/actions?status=all");
  const high = page.getByRole("region", { name: "Big wins" });
  await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toHaveText(
    "Big wins",
  );
  await expect(high.getByRole("article", { name: SUGGESTED.geo })).toContainText("New ideas");
  await expect(
    page.getByRole("region", { name: "Small wins" }).getByRole("article", { name: SUGGESTED.aeo }),
  ).toBeVisible();
  await expectPlainLanguage(page);
});

test("filters narrow the board, live in the URL, and clear", async ({ page }) => {
  await page.goto("/actions");
  await page.getByLabel("Product", { exact: true }).selectOption({ label: CAFE.name });
  await page.getByLabel("Area", { exact: true }).selectOption("GEO");
  await expect(page.getByLabel("Area", { exact: true })).toContainText(
    "Recommended by AI assistants",
  );
  await page.getByLabel("Status", { exact: true }).selectOption({ label: "New ideas" });
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page).toHaveURL(/\/actions\?product=lighthouse-cafe&area=GEO&status=suggested$/);
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAccessibleName(SUGGESTED.geo);

  const clear = page.getByRole("link", { name: "Clear filters" });
  await hydrated(clear);
  await clear.click();
  await expect(page).toHaveURL(/\/actions$/);
  await expect(page.getByLabel("Product", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Area", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("active");
  await expect(card(page, "1 page is missing a title", "Acme Docs")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
});

test("accept, start and mark done move an action through the board", async ({ page }) => {
  await page.goto(`${CAFE_BOARD}&status=all`);
  await changeStatus(page, SUGGESTED.aeo, "Accept", "Waiting for you");
  const history = card(page, SUGGESTED.aeo).locator("details");
  await card(page, SUGGESTED.aeo).getByText("History").click();
  await expect(history.getByRole("listitem").last()).toContainText("You · New ideas → To do");
  await changeStatus(page, SUGGESTED.aeo, "Start", /· In progress$/);
  await changeStatus(page, SUGGESTED.aeo, "Mark done", "Done");

  await page.goto(CAFE_BOARD);
  await expect(card(page, "No guide to your site for AI assistants")).toBeVisible();
  await expect(card(page, SUGGESTED.aeo)).toHaveCount(0);
  await page.goto(`${CAFE_BOARD}&status=done`);
  await expect(card(page, SUGGESTED.aeo)).toBeVisible();
});

test("snooze hides an action until its date; Bring back now brings it back", async ({ page }) => {
  const title = "No guide to your site for AI assistants";
  await page.goto(`${CAFE_BOARD}&status=all`);
  const snooze = card(page, title).getByRole("button", { name: `Snooze…: ${title}` });
  await hydrated(snooze);
  await snooze.click();
  const until = card(page, title).getByLabel("Snooze until");
  await expect(until).toBeFocused();
  // A week from today: the field's minimum is tomorrow.
  const tomorrow = await until.getAttribute("min");
  expect(tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const nextWeek = addIsoDays(tomorrow ?? "", 6);
  await until.fill(nextWeek);
  await card(page, title)
    .getByRole("button", { name: `Snooze: ${title}`, exact: true })
    .click();
  await expect(
    card(page, title).getByText(`Snoozed until ${formatIsoDay(nextWeek, LOCALE)}`),
  ).toBeVisible();

  await page.goto(CAFE_BOARD);
  await expect(card(page, "Your site opts out of AI training")).toBeVisible();
  await expect(card(page, title)).toHaveCount(0);

  await page.goto(`${CAFE_BOARD}&status=snoozed`);
  const wake = card(page, title).getByRole("button", { name: `Bring back now: ${title}` });
  await hydrated(wake);
  await wake.click();
  await expect(page.getByText("Nothing is snoozed.")).toBeVisible();
  await page.goto(CAFE_BOARD);
  await expect(card(page, title).getByText("Waiting for you", { exact: true })).toBeVisible();
});

test("Hand to Claude copies a prompt with the product, fenced evidence and the check", async ({
  page,
}) => {
  await page.goto(`${CAFE_BOARD}&status=suggested`);
  await openTechnical(page, SUGGESTED.geo);
  const copy = card(page, SUGGESTED.geo).getByRole("button", {
    name: `Hand to Claude: ${SUGGESTED.geo}`,
  });
  await hydrated(copy);
  await copy.click();
  await expect(card(page, SUGGESTED.geo).getByRole("status")).toHaveText(
    "Copied — paste it into Claude",
  );
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`on ${CAFE.name} (https://lighthouse-cafe.example.com)`);
  expect(prompt).toContain(
    `\`\`\`text\n- ${GEO_EVIDENCE} (https://lighthouse-cafe.example.com/)\n\`\`\``,
  );
  expect(prompt).toContain("Acceptance check: The home page's first sentence names");
});

test("Today lists the top three actions in board order; issues link to their actions", async ({
  page,
}) => {
  await page.goto("/actions");
  const { active } = await headerCounts(page);
  const top = (await page.getByRole("article").all()).slice(0, 3);
  const titles = await Promise.all(
    top.map((article) => article.getByRole("heading", { level: 3 }).textContent()),
  );

  await page.goto("/");
  const attention = page.getByRole("region", { name: "Worth doing next" });
  await expect(attention.getByRole("article")).toHaveCount(3);
  await expect(attention.getByRole("heading", { level: 3 })).toHaveText(titles.map((t) => t ?? ""));
  await expect(attention.getByRole("link", { name: /more on the Actions board$/ })).toHaveText(
    `${active - 3} more on the Actions board`,
  );

  await page.goto(`/products/${CAFE.id}`);
  const issues = page.getByRole("region", { name: "Issues" });
  for (const title of [
    "Your questions and answers aren't labelled for Google and AI",
    "No guide to your site for AI assistants",
  ]) {
    const issue = issues.getByRole("article", { name: title });
    await expect(issue.getByText("To do", { exact: true })).toBeVisible();
    await expect(issue.getByRole("link", { name: "View on the Actions board" })).toHaveAttribute(
      "href",
      /^\/actions\?product=lighthouse-cafe&status=all#action-\d+$/,
    );
  }
});

/** The focused element's accessible label (aria-label, else its text). */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
  });

test("keyboard: Tab runs from the filters through a card; the snooze form traps nothing", async ({
  page,
}) => {
  const title = "Your questions and answers aren't labelled for Google and AI";
  await page.goto(`${CAFE_BOARD}&area=AEO`);
  await expect(page.getByRole("article")).toHaveCount(1);
  const trigger = card(page, title).getByRole("button", { name: `Snooze…: ${title}` });
  await hydrated(trigger);

  await page.getByRole("button", { name: "Apply" }).focus();
  await page.keyboard.press("Tab");
  expect(await focusedName(page)).toBe("Clear filters");
  const stops: string[] = [];
  for (let i = 0; i < 15 && stops.at(-1) !== technical(title); i++) {
    await page.keyboard.press("Tab");
    stops.push(await focusedName(page));
  }
  const controls = ["Start", "Mark done", "Snooze…", "Dismiss"].map(
    (label) => `${label}: ${title}`,
  );
  expect(stops.filter((name) => controls.includes(name))).toEqual(controls);
  expect(stops).toContain(`History (${title})`);
  expect(stops.at(-1)).toBe(technical(title));

  // Open the snooze form from the keyboard: focus moves into it and Tab walks out the far side.
  await trigger.focus();
  await page.keyboard.press("Enter");
  const until = card(page, title).getByLabel("Snooze until");
  await expect(until).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // The date field has a tab stop per part (month, day, year).
  for (let i = 0; i < 5 && (await focusedName(page)) !== `Snooze: ${title}`; i++) {
    await page.keyboard.press("Tab");
  }
  expect(await focusedName(page)).toBe(`Snooze: ${title}`);
  await page.keyboard.press("Tab");
  expect(await focusedName(page)).toBe(`Cancel snooze: ${title}`);
  await page.keyboard.press("Tab");
  expect(await focusedName(page)).toBe(technical(title));
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(until).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  const handToClaude = card(page, title).getByRole("button", { name: `Hand to Claude: ${title}` });
  await expect(handToClaude).toBeHidden();
  await trigger.focus();
  // Two Tabs: Dismiss, then the Technical details summary.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(handToClaude).toBeVisible();
});

test("the board renders in light and dark", async ({ page }) => {
  await page.goto("/actions");
  const toggle = page.getByRole("button", { name: /^Theme: / });
  await hydrated(toggle);
  for (const theme of ["light", "dark"]) {
    await toggle.click();
    await expect(toggle).toHaveText(`Theme: ${theme}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1, name: "Actions" })).toBeVisible();
    await expect(card(page, "1 page is missing a title", "Acme Docs")).toBeVisible();
  }
});

test("the action API needs a session and a same-origin JSON request", async ({
  page,
  playwright,
}) => {
  const body = { from: "open", to: "done" };
  // Identity header but no session cookie (the config's storage state would add one).
  const anonymous = await playwright.request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "Tailscale-User-Login": E2E_LOGIN },
  });
  const unauthenticated = await anonymous.post("/api/actions/1", {
    headers: { Origin: E2E_ORIGIN },
    data: body,
  });
  expect(unauthenticated.status()).toBe(401);
  await anonymous.dispose();

  const crossSite = await page.request.post("/api/actions/1", {
    headers: { Origin: "https://evil.example.com" },
    data: body,
  });
  expect(crossSite.status()).toBe(403);
});
