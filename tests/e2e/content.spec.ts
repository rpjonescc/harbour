import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { copyParts } from "@/lib/content/render";
import { openDb } from "@/lib/db/client";
import { auditLog, jobs } from "@/lib/db/schema";
import type { JobKind } from "@/lib/jobs/queue";
import { E2E_DB } from "../../playwright.config";
import { PIECES } from "../helpers/content-fixtures";
import { E2E_IDEA_TITLE, E2E_SNIPPETS } from "./content-fixtures";
import { hydrated } from "./hydration";
import { expectPlainLanguage, textOutsideTechnicalDetails } from "./plain-language";

// The whole content machine through the real web server and worker: the fake Screenpipe, the fake
// agent CLI, a real git brain. Serial: each step builds on the one before.
test.describe.configure({ mode: "serial" });
const BRAIN = "./data/e2e-brain";
const db = openDb(E2E_DB);

/** What the worker's queue says about each job of a kind: its state, and its error when it failed. */
const jobStates = (kind: JobKind, only?: (params: Record<string, string>) => boolean) =>
  db
    .select()
    .from(jobs)
    .where(eq(jobs.kind, kind))
    .all()
    .filter((j) => only?.(j.params) ?? true)
    .map((j) => (j.status === "failed" ? `failed: ${j.error}` : j.status));

const waitForJob = (kind: JobKind, only?: (params: Record<string, string>) => boolean) =>
  expect.poll(() => jobStates(kind, only), { timeout: 90_000, intervals: [1000] }).toContain("ok");

async function openContent(page: Page, tab?: RegExp) {
  await page.goto("/content");
  await hydrated(page.getByRole("tab").first());
  if (tab) await page.getByRole("tab", { name: tab }).click();
}

/** Plain words on the page: no job names, file paths or setting names outside Technical details. */
async function expectNoJargon(page: Page) {
  await expectPlainLanguage(page);
  const text = await textOutsideTechnicalDetails(page);
  expect(text).not.toMatch(/content-(?:digest|ideas|draft|atomise|gate|decision)/);
  expect(text).not.toMatch(/\bcontent\/|\.gates\.json|sha256|\bgate:|no-ai-slop|\/home\//);
}

/** Opens one platform's row in the visible tab and returns its piece. */
async function openPiece(page: Page, platform: string) {
  await page.getByRole("tabpanel").locator("summary", { hasText: platform }).first().click();
  return page.getByRole("region", { name: new RegExp(`^${platform}:`) });
}

test("Content starts empty and calm, with the digest gap said in one line", async ({ page }) => {
  await openContent(page);
  await expect(page.getByRole("link", { name: /Content/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Content" })).toBeVisible();
  await expect(
    page.getByText("Ideas and drafts from your recent work. Nothing is posted until you post it."),
  ).toBeVisible();
  await expect(page.getByText(/Ideas this week come from your notes only/)).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Ideas \(0\)/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expectNoJargon(page);
});

test("Make today's digest now stores themes only, never the screen text", async ({ page }) => {
  await openContent(page);
  await page.getByRole("button", { name: "Make today's digest now" }).click();
  await expect(page.getByText("Making it now.")).toBeVisible();
  await waitForJob("content-digest");
  const dir = join(BRAIN, "content/digests");
  const [file] = readdirSync(dir);
  const digest = readFileSync(join(dir, file ?? ""), "utf8");
  expect(digest).toContain("Rewrote the getting-started guide");
  for (const snippet of E2E_SNIPPETS) {
    expect(digest).not.toContain(snippet.text);
    expect(JSON.stringify(db.select().from(jobs).all())).not.toContain(snippet.text);
  }
  await page.reload();
  await expect(page.getByText(/Ideas this week come from your notes only/)).toBeHidden();
});

test("Find new ideas adds one idea, with the angle and sources a click away", async ({ page }) => {
  await openContent(page);
  await page.getByRole("button", { name: "Find new ideas for Acme Docs" }).click();
  await expect(page.getByText("Looking for ideas.")).toBeVisible();
  await waitForJob("content-ideas");
  await openContent(page, /^Ideas \(1\)/);
  const idea = page.getByRole("article", { name: E2E_IDEA_TITLE });
  await expect(idea).toBeVisible();
  await expect(idea.getByText("You rebuilt the getting-started guide this week.")).toBeVisible();
  await expect(idea.getByText("Show the shortest path")).toBeHidden();
  await expectNoJargon(page);
});

test("Write this runs the whole chain: five pieces Ready for you, one that Needs you", async ({
  page,
}) => {
  await openContent(page, /^Ideas \(1\)/);
  await page.getByRole("button", { name: "Write this" }).click();
  // The idea leaves the Ideas tab at once (the button goes with it), so the job is what to wait on.
  await expect(page.getByRole("tab", { name: /^Ideas \(0\)/ })).toBeVisible();
  await waitForJob("content-gate", (p) => p.gate === "facts");
  await openContent(page);
  await expect(page.getByRole("tab", { name: /^Ready for you \(5\)/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Needs you \(1\)/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Being written/ })).toContainText("(0)");
  // The idea moved on and nothing is waiting on a click: the chain queued every step itself.
  expect(jobStates("content-draft")).toEqual(["ok"]);
  expect(jobStates("content-atomise")).toEqual(["ok"]);
  await page.getByRole("tab", { name: /^Ready for you/ }).click();
  await expect(page.getByRole("tabpanel").getByText("5 ready, 1 needs you")).toBeVisible();
  await expectNoJargon(page);
});

test("a piece reads as plain text, copies clean, and keeps its checks folded away", async ({
  page,
}) => {
  await openContent(page, /^Ready for you/);
  const piece = await openPiece(page, "LinkedIn");
  const [whole] = copyParts("linkedin", PIECES.linkedin);
  await expect(piece.getByText("Docs that ship in five minutes.")).toBeVisible();
  await piece.getByRole("button", { name: "Copy Whole piece" }).click();
  await expect(piece.getByText("Copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(whole?.text);
  expect(whole?.text).toContain("#docs");
  const check = piece.getByText(/Writing check: no-ai-slop/).first();
  await expect(check).toBeHidden();
  await piece.getByText("Technical details").click();
  await expect(check).toBeVisible();
  await expect(piece.getByRole("link", { name: "Open in the Second Brain" })).toBeVisible();
  await expectNoJargon(page);
});

test("Approve exports clean markdown into the brain, audited and committed", async ({ page }) => {
  await openContent(page, /^Ready for you/);
  const piece = await openPiece(page, "LinkedIn");
  await piece.getByRole("button", { name: /^Approve:/ }).click();
  await piece.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByRole("tab", { name: /^Approved \(1\)/ })).toBeVisible({
    timeout: 60_000,
  });
  const dir = join(BRAIN, "content/approved/linkedin");
  expect(existsSync(dir) && readdirSync(dir)).toHaveLength(1);
  const exported = readFileSync(join(dir, readdirSync(dir)[0] ?? ""), "utf8");
  expect(exported).toContain("platform: linkedin");
  expect(exported).toContain("Docs that ship in five minutes.");
  expect(exported).not.toMatch(/gates|revision|sha256/);
  expect(
    db
      .select()
      .from(auditLog)
      .all()
      .map((e) => e.event),
  ).toContain("content_decided");
  await page.getByRole("tab", { name: /^Approved/ }).click();
  await expect(page.getByText("LinkedIn").first()).toBeVisible();
  await expectNoJargon(page);
});

test("a piece with an open finding asks 'Approve anyway?' and says what is open", async ({
  page,
}) => {
  await openContent(page, /^Needs you \(1\)/);
  const piece = await openPiece(page, "X");
  // What is open is said in a plain sentence, above the buttons.
  await expect(piece.getByText(/still found 1 pattern/).first()).toBeVisible();
  await piece.getByRole("button", { name: /^Approve:/ }).click();
  await expect(piece.getByText(/^Approve anyway\? .*still found 1 pattern/)).toBeVisible();
  await piece.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByRole("tab", { name: /^Approved \(2\)/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("tab", { name: /^Needs you \(0\)/ })).toBeVisible();
});

test("Edit keeps a piece Ready when the checks pass; Discard asks first and can be cancelled", async ({
  page,
}) => {
  await openContent(page, /^Ready for you/);
  const facebook = await openPiece(page, "Facebook");
  const edited =
    "Our getting-started guide is rebuilt, and a first deploy takes about five minutes.";
  await facebook.getByRole("button", { name: /^Edit:/ }).click();
  await facebook.getByRole("textbox", { name: "Edit the piece text" }).fill(edited);
  await facebook.getByRole("button", { name: "Save" }).click();
  await waitForJob("content-decision", (p) => p.action === "edit");
  await openContent(page, /^Ready for you/);
  // Still in the Ready tab, with the owner's words.
  await expect((await openPiece(page, "Facebook")).getByText(edited)).toBeVisible();
  const blog = await openPiece(page, "Blog post");
  await blog.getByRole("button", { name: /^Discard:/ }).click();
  await blog.getByRole("button", { name: "Cancel" }).click();
  await expect(blog.getByText("Discard this piece?")).toBeHidden();
  await blog.getByRole("button", { name: /^Discard:/ }).click();
  await expect(blog.getByText("Discard this piece?")).toBeVisible();
  await blog.getByRole("button", { name: /^Confirm discard:/ }).click();
  await expect(page.getByRole("tab", { name: /^Discarded \(1\)/ })).toBeVisible({
    timeout: 60_000,
  });
  // Four decisions went through the worker (two approvals, an edit and a discard), each to the end.
  await expect.poll(() => jobStates("content-decision")).toEqual(["ok", "ok", "ok", "ok"]);
  await expectNoJargon(page);
});
