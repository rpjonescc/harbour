import { expect, type Page, request, test } from "@playwright/test";
import { desc } from "drizzle-orm";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { openDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { AREAS } from "@/lib/explain/areas";
import { E2E_DB, E2E_LOGIN, E2E_ORIGIN } from "../../playwright.config";
import { hydrated } from "./hydration";
import { sessionStorageState } from "./session-state";

/** Collects CSP violations reported to the console; assert the list is empty after the page settles. */
function watchCspErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      errors.push(message.text());
    }
  });
  return errors;
}

test("rejects requests without a Tailscale identity", async () => {
  // newContext inherits the project's header and storageState; clear both.
  const anonymous = await request.newContext({
    baseURL: E2E_ORIGIN,
    extraHTTPHeaders: {},
    storageState: { cookies: [], origins: [] },
  });
  const response = await anonymous.get("/");
  expect(response.status()).toBe(403);
  await anonymous.dispose();
});

test("rejects an identity that is not allowlisted", async () => {
  const intruder = await request.newContext({
    baseURL: E2E_ORIGIN,
    extraHTTPHeaders: { "Tailscale-User-Login": "intruder@example.com" },
    storageState: { cookies: [], origins: [] },
  });
  expect((await intruder.get("/")).status()).toBe(403);
  await intruder.dispose();
});

test.describe("without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects to login", async ({ page }) => {
    const cspErrors = watchCspErrors(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in with passkey" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(cspErrors).toEqual([]);
  });

  test("a failed sign-in is audited and clears the flow cookie", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: "harbour_flow",
            value: "unknown-flow",
            domain: "localhost",
            path: "/api/auth",
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: "Strict",
          },
        ],
        origins: [],
      },
    });
    const response = await context.request.post("/api/auth/login/verify", {
      headers: { origin: E2E_ORIGIN },
      data: { response: { id: "nope" } },
    });
    expect(response.status()).toBe(401);
    expect((await context.cookies()).map((c) => c.name)).not.toContain("harbour_flow");
    const latest = openDb(E2E_DB).select().from(auditLog).orderBy(desc(auditLog.id)).get();
    expect(latest).toMatchObject({
      login: E2E_LOGIN,
      event: "login_failed",
      detail: { reason: "expired_challenge" },
    });
    await context.close();
  });

  test("API calls get a JSON 401 instead of a redirect", async ({ page }) => {
    const response = await page.request.post("/api/devices/setup-link", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });
});

test.describe("with an invalid session cookie", () => {
  test.use({ storageState: sessionStorageState("garbage") });

  for (const path of ["/", "/design"]) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test("client navigation re-checks the session on every page", async ({ browser }) => {
  // Layouts are not re-rendered on client navigation, so each page must guard itself.
  const db = openDb(E2E_DB);
  const { token } = createSession(db, E2E_LOGIN, null);
  const context = await browser.newContext({ storageState: sessionStorageState(token) });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Calm waters");
  revokeSession(db, token);
  await page.getByRole("link", { name: "Design system" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("Today renders scores and actions", async ({ page }) => {
      const cspErrors = watchCspErrors(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Calm waters");
      await expect(page.getByRole("note")).toContainText("Sample data");
      const table = page.getByRole("table", { name: "Visibility scores by product" });
      await expect(table.getByRole("rowheader", { name: "Fern & Field" })).toBeVisible();
      const products = page.getByRole("region", { name: "Products" });
      await expect(products.getByRole("link", { name: "Acme Docs" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Worth your attention", exact: true }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(cspErrors).toEqual([]);
    });

    test("design system page renders every section", async ({ page }) => {
      const cspErrors = watchCspErrors(page);
      await page.goto("/design");
      for (const name of ["Colour tokens", "Type", "Components", "Plain-language examples"]) {
        await expect(page.getByRole("heading", { name })).toBeVisible();
      }
      const whatsThis = page.getByRole("button", {
        name: "What's this? (Recommended by AI assistants example)",
      });
      await hydrated(whatsThis);
      await whatsThis.click();
      await expect(whatsThis).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText(AREAS.geo.parts.worth)).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(cspErrors).toEqual([]);
    });
  });
}

test("keyboard: skip link first, then navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Today" })).toBeFocused();
});

test("serves a nonce-based CSP", async ({ page }) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
});

test("devices page marks this device", async ({ page }) => {
  await page.goto("/settings/devices");
  await expect(page.getByText("E2E browser")).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
});

test("design page includes Second Brain component examples", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Second Brain examples" })).toBeVisible();
  await expect(page.getByText("Stale — review was due 2026-02-01")).toBeVisible();
  await expect(page.getByText(/Frontmatter invalid/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Search/ })).toBeVisible();
});
