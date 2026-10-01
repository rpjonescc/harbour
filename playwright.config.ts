import { defineConfig, devices } from "@playwright/test";

const PORT = 3401;
export const E2E_LOGIN = "e2e@example.com";
export const E2E_ORIGIN = `http://localhost:${PORT}`;
export const E2E_DB = "./data/e2e.db";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_ORIGIN,
    // Real Lock 1 mechanism: Tailscale Serve would add this header.
    extraHTTPHeaders: { "Tailscale-User-Login": E2E_LOGIN },
    storageState: "./data/e2e-storage.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The readiness probe sends no identity; Playwright counts a 403 as "up".
    env: {
      NODE_ENV: "production",
      HARBOUR_ALLOWED_LOGINS: E2E_LOGIN,
      HARBOUR_ORIGIN: E2E_ORIGIN,
      HARBOUR_RP_ID: "localhost",
      HARBOUR_DB_PATH: E2E_DB,
      // Pinned to the example so e2e never depends on a local harbour.config.json.
      HARBOUR_CONFIG_PATH: "./harbour.config.example.json",
    },
  },
});
