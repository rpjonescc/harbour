import { defineConfig, devices } from "@playwright/test";

const PORT = 3401;
export const E2E_LOGIN = "e2e@example.com";
export const E2E_ORIGIN = `http://localhost:${PORT}`;
// In its own directory: the worker quarantines next to the database, so sharing ./data with the
// live service's database would share its quarantine too. Recreated by tests/e2e/prepare.ts.
export const E2E_DB = "./data/e2e/harbour.db";
const E2E_BRAIN = "./data/e2e-brain";
/** The fictional Acme Docs site the scans read (tests/e2e/fixture-site.ts). */
export const E2E_SITE_PORT = 3402;

// Web server and worker see the same settings, as in production.
const env = {
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: E2E_LOGIN,
  HARBOUR_ORIGIN: E2E_ORIGIN,
  HARBOUR_RP_ID: "localhost",
  HARBOUR_DB_PATH: E2E_DB,
  HARBOUR_BRAIN_DIR: E2E_BRAIN,
  HARBOUR_EDITOR_URL_TEMPLATE: "",
  // The example products, with Acme Docs on the local fixture site; never a harbour.config.json.
  HARBOUR_CONFIG_PATH: "./tests/fixtures/harbour.config.e2e.json",
  // Test only (refused on a non-loopback origin): lets the worker scan the fixture site.
  HARBOUR_TEST_MODE: "1",
  HARBOUR_SCAN_ALLOW_LOOPBACK: "1",
  // No scheduled scans: they would queue ahead of the agent runs under test, and the scan specs
  // run the only scan with Scan now. Shared, so Sources (web) reports what the worker does.
  HARBOUR_SCHEDULED_SCANS: "off",
  // No scheduled weekly analyst either: it would queue ahead of the runs under test.
  HARBOUR_SCHEDULED_ANALYST: "off",
  // No monthly research refresh: it would queue ahead of the runs under test.
  HARBOUR_SCHEDULED_RESEARCH: "off",
  // No nightly backup: the runs under test own the queue.
  HARBOUR_SCHEDULED_BACKUP: "off",
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
    {
      name: "chromium",
      testIgnore: /(agents|scans|actions|analyst)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Agent runs change the brain (new documents, sidebar counts), so they run after the rest.
    {
      name: "agents",
      testMatch: /agents\.spec\.ts/,
      dependencies: ["chromium"],
      use: { ...devices["Desktop Chrome"] },
    },
    // A scan replaces Today's sample with real scores, and shares the worker's one-job-at-a-time
    // queue with the agent runs, so scans run last.
    {
      name: "scans",
      testMatch: /scans\.spec\.ts/,
      dependencies: ["agents"],
      use: { ...devices["Desktop Chrome"] },
    },
    // The board needs the scan's rule actions; actions.spec.ts seeds a second product on top.
    {
      name: "actions",
      testMatch: /actions\.spec\.ts/,
      dependencies: ["scans"],
      use: {
        ...devices["Desktop Chrome"],
        // "Hand to Claude" copies to the clipboard, which the spec reads back.
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
    // The weekly analyst adds a suggestion to the board the actions specs count, so it runs last.
    {
      name: "analyst",
      testMatch: /analyst\.spec\.ts/,
      dependencies: ["actions"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Started in order: the fixture site, then the web server (it migrates the database), then
  // the worker.
  webServer: [
    {
      name: "fixture-site",
      command: "pnpm exec tsx tests/e2e/fixture-site.ts",
      url: `http://127.0.0.1:${E2E_SITE_PORT}/robots.txt`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
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
      },
    },
  ],
});
