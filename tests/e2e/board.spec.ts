import { expect, type Locator, type Page, test } from "@playwright/test";
import { hydrated } from "./hydration";
import { BOARD_CARDS, FERN, seedBoard } from "./seed-board";

// Runs last: it seeds Fern & Field's cards, which the earlier specs' board counts must not see.
// Every test moves its own card; only the first reads the untouched counts.

test.describe.configure({ mode: "serial" });
test.beforeAll(() => seedBoard());

const BOARD = `/actions?view=board&product=${FERN.id}`;

const column = (page: Page, name: string) =>
  page.getByRole("region", { name: new RegExp(`^${name}, `) });
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true });
const cardsIn = (page: Page, name: string) => column(page, name).getByRole("article");

/** Opens a card's "Move to…" menu from the keyboard and returns the menu. */
async function openMoveMenu(page: Page, title: string): Promise<Locator> {
  const trigger = card(page, title).getByRole("button", { name: `Move to… ${title}` });
  await hydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: `Move ${title} to` });
  await expect(menu).toBeVisible();
  return menu;
}

test("the board shows six columns with their counts", async ({ page }) => {
  await page.goto(BOARD);
  const expected = [
    ["Backlog", 2],
    ["Queue", 1],
    ["Started", 1],
    ["In progress", 0],
    ["In review", 1],
    ["Done", 1],
  ] as const;
  for (const [name, count] of expected) {
    const label = `${name}, ${count} ${count === 1 ? "card" : "cards"}`;
    await expect(page.getByRole("region", { name: label })).toBeVisible();
    await expect(cardsIn(page, name)).toHaveCount(count);
  }
  await expect(card(page, BOARD_CARDS.stuck).getByText("Stuck", { exact: true })).toBeVisible();
});

test("Move to… moves a card by keyboard, announces it and returns focus", async ({ page }) => {
  const title = BOARD_CARDS.keyboard;
  await page.goto(BOARD);
  const menu = await openMoveMenu(page, title);
  // The card's own column is not offered; the first other column has focus.
  await expect(menu.getByRole("menuitem", { name: "Backlog" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Queue" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("status").filter({ hasText: `Moved ${title} to Queue` }),
  ).toBeAttached();
  await expect(cardsIn(page, "Queue").getByRole("heading", { name: title })).toBeVisible();
  await expect(column(page, "Queue")).toHaveAccessibleName("Queue, 2 cards");
  // After the refresh, focus is on the card's heading, not lost to the page.
  await expect(page.getByRole("heading", { level: 3, name: title })).toBeFocused();
  await page.reload();
  await expect(cardsIn(page, "Queue").getByRole("heading", { name: title })).toBeVisible();
});

test("Escape closes the move menu and gives focus back to its button", async ({ page }) => {
  const title = BOARD_CARDS.queued;
  await page.goto(BOARD);
  const menu = await openMoveMenu(page, title);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(card(page, title).getByRole("button", { name: `Move to… ${title}` })).toBeFocused();
});

test("dragging a card to another column moves it", async ({ page }) => {
  const title = BOARD_CARDS.drag;
  await page.goto(BOARD);
  await hydrated(card(page, title));
  // Step by step, not dragTo: React must render the drag state before the first dragover.
  const target = await column(page, "Started").getByRole("list").boundingBox();
  const source = await card(page, title).boundingBox();
  if (!target || !source) throw new Error("The card or the column is not on the page.");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2 + 10);
  await page.waitForTimeout(300);
  await page.mouse.move(target.x + target.width / 2, target.y + 30, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(cardsIn(page, "Started").getByRole("heading", { name: title })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: `Moved ${title} to Started` }),
  ).toBeAttached();
  await page.reload();
  await expect(cardsIn(page, "Started").getByRole("heading", { name: title })).toBeVisible();
});

test("a refused move puts the card back with a plain sentence", async ({ page }) => {
  const title = BOARD_CARDS.withPullRequest;
  await page.goto(BOARD);
  const menu = await openMoveMenu(page, title);
  await menu.getByRole("menuitem", { name: "In progress" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /pull request/ })).toHaveText(
    "This card has a pull request, so it counts as In review.",
  );
  await expect(cardsIn(page, "In review").getByRole("heading", { name: title })).toBeVisible();
  await expect(cardsIn(page, "In progress")).toHaveCount(0);
  await page.reload();
  await expect(cardsIn(page, "In review").getByRole("heading", { name: title })).toBeVisible();
});

test("Today's strip links land on the board, and Show everything clears the focus", async ({
  page,
}) => {
  await page.goto("/");
  const strip = page.getByRole("region", { name: "Where the work is" });
  const tile = strip.getByRole("link", { name: /^Queue: \d+ cards?$/ });
  await expect(tile).toHaveAttribute("href", "/actions?view=board#column-queue");
  await tile.click();
  await expect(page).toHaveURL(/\/actions\?view=board#column-queue$/);
  await expect(page.locator("#column-queue")).toBeVisible();

  await page.goto("/");
  await strip.getByRole("link", { name: "See the stuck jobs" }).click();
  await expect(page).toHaveURL(/\/actions\?view=board&focus=stuck$/);
  await expect(page.getByText("Showing only the stuck jobs.")).toBeVisible();
  await expect(card(page, BOARD_CARDS.stuck)).toBeVisible();
  await expect(card(page, BOARD_CARDS.finished)).toHaveCount(0);

  const everything = page.getByRole("link", { name: "Show everything" });
  await hydrated(everything);
  await everything.click();
  await expect(page).toHaveURL(/\/actions$/);
  await expect(page.getByText("Showing only the stuck jobs.")).toHaveCount(0);
  await expect(card(page, BOARD_CARDS.finished)).toBeVisible();
});
