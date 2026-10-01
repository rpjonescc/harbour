import { expect, test } from "@playwright/test";

test("Second Brain start page, document, links and context rail", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      cspErrors.push(message.text());
    }
  });

  await page.goto("/brain");
  await expect(page.getByRole("heading", { level: 1, name: "Start here" })).toBeVisible();

  await page
    .locator(".brain-prose")
    .getByRole("link", { name: "how-ai-engines-pick-sources" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "How AI engines pick their sources" }),
  ).toBeVisible();
  await expect(page.getByText(/Stale — review was due 2026-02-01/)).toBeVisible();
  await expect(page.locator(".wikilink-broken", { hasText: "missing-note" })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned),
  ).toBeUndefined();
  await expect(page.locator(".brain-prose img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "An external study" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(
    page
      .getByRole("complementary", { name: "Document context" })
      .getByRole("link", { name: "Signals that matter" }),
  ).toBeVisible();

  await page.locator(".brain-prose").getByRole("link", { name: "glossary", exact: true }).click();
  const rail = page.getByRole("complementary", { name: "Document context" });
  await expect(rail.getByRole("link", { name: "How AI engines pick their sources" })).toBeVisible();
  expect(cspErrors).toEqual([]);
});

test("invalid frontmatter is reported but the document still renders", async ({ page }) => {
  await page.goto("/brain/research/bad-frontmatter.md");
  await expect(page.getByRole("note")).toContainText("Frontmatter invalid");
  await expect(page.getByText("Still readable.")).toBeVisible();
});

test("search with Ctrl+K opens the chosen document", async ({ page }) => {
  await page.goto("/brain");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search the Second Brain" });
  await expect(input).toBeFocused();
  await input.fill("perplex");
  await expect(
    page.getByRole("option", { name: /How AI engines pick their sources/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/brain\/research\/geo\/how-ai-engines-pick-sources\.md$/);
});

test("path traversal and non-markdown paths are not found", async ({ page }) => {
  for (const path of [
    "/brain/..%2F..%2Fetc%2Fpasswd",
    "/brain/%2E%2E/README.md",
    "/brain/research/nope.md",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("encoded document names open the intended file", async ({ page }) => {
  for (const [url, title] of [
    ["/brain/percent%2520.md", "Literal percent twenty"],
    ["/brain/percent%252F.md", "Literal percent slash"],
    ["/brain/space%20name.md", "Space name"],
    ["/brain/caf%C3%A9.md", "Café"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
});

test("sidebar links to the Second Brain", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /Second Brain/ })
    .click();
  await expect(page).toHaveURL(/\/brain$/);
});

test("opening a new document clears its tree marker and sidebar count", async ({ page }) => {
  await page.goto("/brain");
  const doc = page
    .getByRole("navigation", { name: "Documents" })
    .getByRole("link", { name: /badge-check/ });
  await expect(doc).toContainText("new");
  const badge = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /Second Brain/ });
  const count = badge.locator('span[aria-hidden="true"]');
  const before = Number(await count.textContent());
  await doc.click();
  await expect(page.getByRole("heading", { level: 1, name: "Badge check" })).toBeVisible();
  await expect(doc).not.toContainText("new");
  if (before > 1) await expect(count).toHaveText(String(before - 1));
  else await expect(count).toHaveCount(0);
});

test.describe("app install assets", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("manifest and icons load without a session", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).name).toBe("Harbour");
    const icon = await request.get("/icons/192");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
  });
});
