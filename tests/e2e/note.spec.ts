import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { openDb } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { localTime } from "@/lib/format/zoned-time";
import { notePath, noteStamp } from "@/lib/note/stamp";
import { E2E_DB, E2E_LOGIN, E2E_ORIGIN, E2E_QUIET_ORIGIN } from "../../playwright.config";
import { GOOD_NOTE, noteFileText, seedNoteJob, seedPublishedNote } from "../helpers/note";
import { hydrated } from "./hydration";
import { expectPlainLanguage } from "./plain-language";

// The worker runs tests/fixtures/fake-claude.mjs: for a daily note it reads the fenced facts out
// of the prompt and writes a note that is honest about them. Runs after scans.spec.ts, so Today
// is real (not the sample).

test.describe.configure({ mode: "serial" });

const BRAIN = "./data/e2e-brain";
// The server's zone: E2E leaves HARBOUR_TIMEZONE unset, so it is this machine's.
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const card = (page: Page) => page.getByRole("region", { name: "A note from Harbour" });

/** A stamp `hoursAgo` hours back: recent enough to show, and clear of the worker's run stamp. */
const stampAgo = (hoursAgo: number) =>
  noteStamp(localTime(ZONE, new Date(Date.now() - hoursAgo * 3_600_000)));

function writeNoteFile(stamp: string) {
  const file = join(BRAIN, notePath(stamp));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, noteFileText(GOOD_NOTE));
  return file;
}

test("with no note yet, the card shows the quiet gap and the briefing is still the h1", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Sample data")).toHaveCount(0);
  // The e2e worker has the schedule off, so no next note is promised.
  await expect(card(page)).toContainText("No note yet today.");
  await expect(card(page)).not.toContainText("is written at");
  await expect(card(page).getByRole("button", { name: "Write me a fresh one" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("No note");
  await expectPlainLanguage(page);
});

test("a stamp-named note file with no succeeded job is not shown", async ({ page }) => {
  // The agent can write any file in the brain; only a succeeded job vouches for a note.
  const file = writeNoteFile(stampAgo(2));
  try {
    await page.goto("/");
    await expect(card(page)).toContainText("No note yet today.");
    await expect(card(page)).not.toContainText(GOOD_NOTE.headline);
  } finally {
    rmSync(file);
  }
});

test("a published note shows on the card, the briefing stays the h1, and quiet hides it all", async ({
  page,
}) => {
  const stamp = stampAgo(3);
  const db = openDb(E2E_DB);
  seedPublishedNote(db, BRAIN, stamp, GOOD_NOTE);
  try {
    await page.goto("/");
    await expect(card(page)).toContainText(GOOD_NOTE.greeting);
    await expect(card(page)).toContainText(GOOD_NOTE.headline);
    await expect(card(page)).toContainText(GOOD_NOTE.picks[0] ?? "");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText(GOOD_NOTE.headline);
    await expect(page.locator("[data-wave]")).toHaveCount(1);
    await expectPlainLanguage(page);

    // HARBOUR_PERSONALITY=quiet (a second server, same database and brain): no card, no wave.
    await page.goto(`${E2E_QUIET_ORIGIN}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "A note from Harbour" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Write me a fresh one" })).toHaveCount(0);
    await expect(page.locator("[data-wave]")).toHaveCount(0);
  } finally {
    rmSync(join(BRAIN, notePath(stamp)));
    db.delete(jobs).where(eq(jobs.kind, "daily-note")).run();
  }
});

test("Write me a fresh one queues a note, the worker commits it, and it appears without a reload", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto("/");
  const ask = page.getByRole("button", { name: "Write me a fresh one" });
  await hydrated(ask);
  await ask.click();
  await expect(card(page).getByRole("status")).toContainText("Writing a fresh one now.");
  await expect(card(page)).toContainText("A quiet one, in a good way.", { timeout: 100_000 });
  await expect(card(page)).toContainText("Nothing here is shouting for you.");
  await expect(card(page).getByText(/^Written /)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expectPlainLanguage(page);
  // Served from the brain, so it survives a reload.
  await page.reload();
  await expect(card(page)).toContainText("A quiet one, in a good way.");
});

test("the run is in the Agents history and committed one file", async ({ page }) => {
  await page.goto("/agents");
  const run = page
    .getByRole("table", { name: "Agent runs" })
    .getByRole("link", { name: /^Daily note: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ })
    .first();
  await expect(run).toBeVisible();
  await run.click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  await expect(
    page.getByRole("list", { name: "Run activity" }).getByText("Committed 1 file(s)"),
  ).toBeVisible();
});

test("the button stops at the daily limit and says so", async ({ page }) => {
  // One owner request has run today; four more reach the cap of five.
  const db = openDb(E2E_DB);
  for (let i = 0; i < 4; i++) {
    seedNoteJob(db, stampAgo(30 + i), "ok");
  }
  db.update(jobs)
    .set({ requestedBy: E2E_LOGIN, createdAt: new Date() })
    .where(eq(jobs.kind, "daily-note"))
    .run();
  await page.goto("/");
  const ask = page.getByRole("button", { name: "Write me a fresh one" });
  await hydrated(ask);
  await ask.click();
  await expect(card(page).getByRole("status")).toContainText("That's plenty of notes for one day.");
  await expect(ask).toBeEnabled();
});

test("the note API needs a same-origin request and never takes the time from the client", async ({
  page,
}) => {
  // The cap (5 a day) and the stamp are unit-tested; here the HTTP contract through the real server.
  const crossSite = await page.request.post("/api/agents/run", {
    headers: { origin: "https://elsewhere.example" },
    data: { kind: "daily-note" },
  });
  expect(crossSite.status()).toBe(403);
  const fromClient = await page.request.post("/api/agents/run", {
    headers: { origin: E2E_ORIGIN },
    data: { kind: "daily-note", stamp: "2020-01-01-0000" },
  });
  expect(fromClient.status()).toBe(400);
});
