// The control tower (Today, `/`) in a real browser, over the data every earlier spec left behind:
// real checks, board cards, ideas, content and finished runs.
import { expect, type Page, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { openDb } from "@/lib/db/client";
import { GLOSSARY } from "@/lib/explain/glossary";
import { PAGE_HELP } from "@/lib/explain/page-help";
import {
  HEADLINE_UNREAD,
  LIGHT_LABELS,
  SECTION_TITLES,
  TILE_FAILED,
  TONE_WORDS,
} from "@/lib/explain/tower";
import { FEED_TEXT, WINS_TEXT } from "@/lib/explain/tower-tiles";
import { THEME_COOKIE } from "@/lib/theme";
import { E2E_DB, E2E_ORIGIN } from "../../playwright.config";
import { hydrated } from "./hydration";
import { expectPlainLanguage } from "./plain-language";

const SECTIONS = Object.values(SECTION_TITLES);
const TONES = Object.values(TONE_WORDS).join("|");
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Opens the Worker light and returns its glossary word, a `<Term>` inside the open panel. */
async function workerTerm(page: Page) {
  const light = region(page, SECTION_TITLES.systems).getByRole("button", { name: /^Worker: / });
  await hydrated(light);
  await light.click();
  await expect(light).toHaveAttribute("aria-expanded", "true");
  const term = region(page, SECTION_TITLES.systems).getByRole("button", {
    name: "Worker",
    exact: true,
  });
  await hydrated(term);
  return term;
}

const tipOf = (page: Page) =>
  page.getByRole("tooltip").filter({ hasText: GLOSSARY.worker.meaning });

test("the tower answers in order: one headline, six sections, every tile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(SECTIONS);

  // Eight lights, each with its label and its tone in words.
  const lights = region(page, SECTION_TITLES.systems).getByRole("button", {
    name: new RegExp(`^(${Object.values(LIGHT_LABELS).join("|")}): (${TONES})$`),
  });
  await expect(lights).toHaveCount(8);
  for (const label of Object.values(LIGHT_LABELS)) {
    await expect(lights.filter({ hasText: label })).toHaveCount(1);
  }

  // Needs you: at most five, each with one link that opens a real page.
  const needs = region(page, SECTION_TITLES.needs).getByRole("listitem");
  const count = await needs.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
  for (const item of await needs.all()) {
    const links = item.getByRole("link");
    await expect(links).toHaveCount(1);
    const href = await links.getAttribute("href");
    if (href?.startsWith("/")) expect((await page.request.get(href)).status()).toBe(200);
  }

  await expect(page.getByTestId("flow-bar")).toBeVisible();
  const products = region(page, SECTION_TITLES.products);
  for (const name of ["Acme Docs", "Fern & Field"]) {
    const card = products.getByRole("article", { name });
    await expect(card.getByRole("heading", { level: 3 }).getByRole("link")).toHaveAttribute(
      "href",
      /^\/products\//,
    );
  }

  const activity = region(page, SECTION_TITLES.activity);
  await expect(activity.getByText(FEED_TEXT.running, { exact: true })).toBeVisible();
  await expect(activity.getByText(FEED_TEXT.finished, { exact: true })).toBeVisible();
  const wins = region(page, SECTION_TITLES.wins);
  await expect(wins.getByText(WINS_TEXT.barsCaption).first()).toBeVisible();
  // The bars have a table of the same numbers for screen readers.
  await expect(wins.getByRole("table")).toHaveCount(1);
  await expectPlainLanguage(page);
});

test("Decide in Needs you lands on the board", async ({ page }) => {
  await page.goto("/");
  const decide = region(page, SECTION_TITLES.needs).getByRole("link", { name: /^Decide/ });
  await decide.click();
  await expect(page).toHaveURL(/\/actions\?view=board/);
  await expect(page.getByRole("heading", { level: 1, name: "Actions" })).toBeVisible();
});

test("a term tip opens on hover and on focus, and Escape closes it and keeps focus", async ({
  page,
}) => {
  await page.goto("/");
  const term = await workerTerm(page);
  await expect(tipOf(page)).toBeHidden();
  await term.hover();
  await expect(tipOf(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tipOf(page)).toBeHidden();

  await term.focus();
  await expect(tipOf(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tipOf(page)).toBeHidden();
  await expect(term).toBeFocused();
});

test("What's this page? opens with ? and by click, and lists the page's words", async ({
  page,
}) => {
  await page.goto("/");
  const help = page.getByRole("button", { name: "What's this page?" });
  await hydrated(help);
  await page.keyboard.press("?");
  await expect(help).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(`[id="${await help.getAttribute("aria-controls")}"]`);
  await expect(panel).toContainText(PAGE_HELP.tower.purpose);
  await expect(panel.getByText("Words on this page")).toBeVisible();
  await expect(panel.locator("dt")).toHaveCount(PAGE_HELP.tower.terms.length);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(help).toBeFocused();
  await help.click();
  await expect(panel).toBeVisible();
});

test("auto-refresh never fires while the tab is hidden, and catches up once on return", async ({
  page,
}) => {
  await page.clock.install();
  const refreshes: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    const url = new URL(request.url());
    // A refresh re-reads this page's server data; prefetches of links are not refreshes.
    if (headers.rsc === "1" && !headers["next-router-prefetch"] && url.pathname === "/") {
      refreshes.push(request.url());
    }
  });
  await page.goto("/");
  await hydrated(page.getByRole("button", { name: "What's this page?" }));
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);

  await setVisibility("hidden");
  await page.clock.runFor(5 * 60_000);
  expect(refreshes).toHaveLength(0);

  await setVisibility("visible");
  await expect.poll(() => refreshes.length).toBe(1);
  await page.clock.runFor(61_000);
  await expect.poll(() => refreshes.length).toBeGreaterThanOrEqual(2);
});

test("with reduced motion nothing on the tower moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await workerTerm(page);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("the keyboard reaches every part of the tower in reading order, with visible focus", async ({
  page,
}) => {
  await page.goto("/");
  await hydrated(page.getByRole("button", { name: "What's this page?" }));
  const stops: { section: string | null; ordered: boolean; outline: string }[] = [];
  for (let i = 0; i < 120; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const prev = (window as unknown as { __lastStop?: Element }).__lastStop;
      const ordered =
        !prev || !!(prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      (window as unknown as { __lastStop?: Element }).__lastStop = el;
      const section = el.closest("section[aria-labelledby]");
      const heading =
        section && document.getElementById(section.getAttribute("aria-labelledby") ?? "");
      return {
        section: heading?.textContent ?? null,
        ordered,
        outline: getComputedStyle(el).outlineStyle,
      };
    });
    if (!stop) break;
    stops.push(stop);
  }
  expect(stops.every((s) => s.ordered)).toBe(true);
  expect(stops.every((s) => s.outline !== "none")).toBe(true);
  // Every section with something to press is reached (Wins has only words and bars).
  const pressable = await page
    .getByRole("main")
    .locator("section[aria-labelledby]")
    .evaluateAll((sections) =>
      sections
        .filter((section) => section.querySelector("a[href], button"))
        .map(
          (section) =>
            document.getElementById(section.getAttribute("aria-labelledby") ?? "")?.textContent,
        ),
    );
  expect(pressable.length).toBeGreaterThanOrEqual(5);
  const reached = new Set(stops.map((s) => s.section));
  for (const title of pressable) expect(reached).toContain(title);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("nothing scrolls sideways or clips, lights sit 4 by 2, and a tap opens a term", async ({
    page,
  }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    // The flow bar's segments wrap rather than run past the bar's edge.
    const clipped = await page.getByTestId("flow-bar").evaluate((bar) => {
      const edge = bar.getBoundingClientRect().right;
      return [...bar.children].filter((s) => s.getBoundingClientRect().right > edge + 1).length;
    });
    expect(clipped).toBe(0);
    // The jump links are one short row that scrolls sideways, not tall wrapped rows.
    const jump = await page.getByTestId("jump-list").boundingBox();
    expect(jump?.height ?? 0).toBeLessThanOrEqual(60);
    const lights = region(page, SECTION_TITLES.systems).getByRole("button", {
      name: new RegExp(`^(${Object.values(LIGHT_LABELS).join("|")}): `),
    });
    const tops = await lights.evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(2);

    const term = await workerTerm(page);
    await term.tap();
    await expect(tipOf(page)).toBeVisible();
    await term.tap();
    await expect(tipOf(page)).toBeHidden();

    // The narrowest phone the spec names.
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  });
});

test.describe("on a tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("the work strip's Stuck and Needs you lines keep their words on a line or two", async ({
    page,
  }) => {
    await page.goto("/");
    const strip = page.getByRole("region", { name: SECTION_TITLES.work });
    for (const name of ["See the stuck jobs", "See what needs you"]) {
      const line = strip.getByRole("listitem").filter({ has: page.getByRole("link", { name }) });
      const box = await line.boundingBox();
      expect(box?.height ?? 0).toBeLessThanOrEqual(100);
    }
  });
});

test.describe("in the night theme", () => {
  test("the tower renders with the night tokens", async ({ page, context }) => {
    await context.addCookies([{ name: THEME_COOKIE, value: "night", url: E2E_ORIGIN }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(SECTIONS);
  });
});

// Last: hides the worker's table from the web process for one render, so the real systems reader
// throws inside the real tower loader, then puts it back.
test("one tile that can't be read fails alone, in a plain sentence", async ({ page }) => {
  const db = openDb(E2E_DB);
  db.run(sql.raw("ALTER TABLE worker_status RENAME TO worker_status_hidden_e2e"));
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(HEADLINE_UNREAD.systems);
    await expect(region(page, SECTION_TITLES.systems)).toContainText(TILE_FAILED);
    for (const title of SECTIONS.slice(1)) {
      await expect(region(page, title)).toBeVisible();
      await expect(region(page, title)).not.toContainText(TILE_FAILED);
    }
    // The raw error stays behind Technical details.
    await expectPlainLanguage(page);
  } finally {
    db.run(sql.raw("ALTER TABLE worker_status_hidden_e2e RENAME TO worker_status"));
  }
});
