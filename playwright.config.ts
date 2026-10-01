import { defineConfig, devices } from "@playwright/test";

const PORT = 3401;
export const E2E_LOGIN = "e2e@example.com";
export const E2E_ORIGIN = `http://localhost:${PORT}`;
// In its own directory: the worker quarantines next to the database, so sharing ./data with the
// live service's database would share its quarantine too. Recreated by tests/e2e/prepare.ts.
export const E2E_DB = "./data/e2e/harbour.db";
const E2E_BRAIN = "./data/e2e-brain";

// Web server and worker see the same settings, as in production.
const env = {
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: E2E_LOGIN,
  HARBOUR_ORIGIN: E2E_ORIGIN,
  HARBOUR_RP_ID: "localhost",
  HARBOUR_DB_PATH: E2E_DB,
  HARBOUR_BRAIN_DIR: E2E_BRAIN,
  HARBOUR_EDITOR_URL_TEMPLATE: "",
  // Pinned to the example so e2e never depends on a local harbour.config.json.
  HARBOUR_CONFIG_PATH: "./harbour.config.example.json",
  // Fictional token: the agent CLI is the fake below, so nothing is ever sent anywhere.
  HARBOUR_CLAUDE_OAUTH_TOKEN: "e2e-fake-token",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_ORIGIN,
    // Real Lock 1 mechanism: Tailscale Serve would add this header.
    extraHTTPHeaders: { "Tailscale-User-Login": E2E_LOGIN },
    storageState: "./data/e2e-storage.json",
  },
  projects: [
    { name: "chromium", testIgnore: /agents\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Agent runs change the brain (new documents, sidebar counts), so they run after the rest.
    {
      name: "agents",
      testMatch: /agents\.spec\.ts/,
      dependencies: ["chromium"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Started in order: the web server first (it migrates the database), then the worker.
  webServer: [
    {
      name: "web",
      command: `pnpm build && pnpm next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      // The readiness probe sends no identity; Playwright counts a 403 as "up".
      env,
    },
    {
      name: "worker",
      command: "pnpm exec tsx worker/index.ts",
      // The worker has no HTTP port, and a URL probe would find the web server already up and
      // refuse to start; Playwright waits for the worker's ready line on stdout instead.
      wait: { stdout: /harbour-worker ready/ },
      // SIGTERM to the process group lets the worker stop the way systemd stops it.
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...env,
        HARBOUR_CLAUDE_BIN: `${process.cwd()}/tests/fixtures/fake-claude.mjs`,
        HARBOUR_AGENT_TIMEOUT_MINUTES: "1",
        // No scans of the example products: they would queue ahead of the agent runs under test.
        HARBOUR_SCHEDULED_SCANS: "off",
      },
    },
  ],
});
