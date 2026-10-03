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
/** The fake Screenpipe the content specs' digest reads (tests/e2e/fake-screenpipe-server.ts). */
export const E2E_SCREENPIPE_PORT = 3404;
// Fictional: the fake server accepts exactly this bearer key.
export const E2E_SCREENPIPE_KEY = "e2e-fake-screenpipe-key";
/** The fake Treg the outside-view specs call (tests/e2e/fake-treg-server.ts): never the real service. */
export const E2E_TREG_PORT = 3405;
// Fictional: the fake accepts any key, and the specs check this one never reaches a page.
export const E2E_TREG_KEY = "e2e-fake-treg-key";
/** A second web server, with the quiet personality, over the same database and brain. */
export const E2E_QUIET_ORIGIN = "http://localhost:3403";

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
  // No scheduled daily note: the note specs choose Write me a fresh one, and a scheduled run would
  // queue ahead of the runs under test (the personality stays warm, so the card and wave show).
  HARBOUR_SCHEDULED_NOTE: "off",
  // The content machine is on for every spec (its Content page is part of the shell). A scheduled
  // digest or ideas run would queue ahead of the runs under test, so only the buttons start them.
  HARBOUR_CONTENT: "on",
  HARBOUR_SKILLS_DIR: "./data/e2e-skills",
  HARBOUR_SCHEDULED_DIGEST: "off",
  HARBOUR_SCHEDULED_IDEAS: "off",
  // The web process only checks that a key is set; the worker is the one that uses it.
  HARBOUR_SCREENPIPE_URL: `http://127.0.0.1:${E2E_SCREENPIPE_PORT}`,
  HARBOUR_SCREENPIPE_API_KEY: E2E_SCREENPIPE_KEY,
  // The outside view: a key and a budget, so Run this check now is allowed. The worker below is the
  // e2e entry (tests/e2e/worker.ts), which points Treg's collector at the fake: no setting can.
  HARBOUR_TREG_API_KEY: E2E_TREG_KEY,
  HARBOUR_MONTHLY_BUDGET_AUD: "10",
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
      testIgnore: /(agents|scans|actions|analyst|note|content|settings|outside)\.spec\.ts/,
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
    // The note specs need the real (scored) Today the scans leave behind, and share the worker's
    // one-job-at-a-time queue, so they run alone rather than beside the analyst runs.
    {
      name: "note",
      testMatch: /note\.spec\.ts/,
      dependencies: ["analyst"],
      use: { ...devices["Desktop Chrome"] },
    },
    // The content chain adds a digest, an idea run and five agent runs to the worker's
    // one-job-at-a-time queue and commits to the brain, so it runs alone after the note specs.
    {
      name: "content",
      testMatch: /content\.spec\.ts/,
      dependencies: ["note"],
      use: {
        ...devices["Desktop Chrome"],
        // The Copy buttons write to the clipboard, which the spec reads back.
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
    // Back up now and the research refresh queue work behind every earlier run, and the
    // refresh rewrites a research document, so operations run after everything else.
    {
      name: "operations",
      testMatch: /settings\.spec\.ts/,
      dependencies: ["content"],
      use: { ...devices["Desktop Chrome"] },
    },
    // Run this check now queues a worker job (paid, to the fake Treg), and the specs leave real
    // checks in the history, so they run after everything else.
    {
      name: "outside",
      testMatch: /outside\.spec\.ts/,
      dependencies: ["operations"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Started in order: the fake Screenpipe, the fixture site, then the web server (it migrates the
  // database), then the worker.
  webServer: [
    {
      name: "fake-screenpipe",
      command: "pnpm exec tsx tests/e2e/fake-screenpipe-server.ts",
      url: `http://127.0.0.1:${E2E_SCREENPIPE_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: "fake-treg",
      command: "pnpm exec tsx tests/e2e/fake-treg-server.ts",
      url: `http://127.0.0.1:${E2E_TREG_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
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
      // Already built by the web server above; only the personality differs.
      name: "web-quiet",
      command: "pnpm next start -H 127.0.0.1 -p 3403",
      url: "http://127.0.0.1:3403/login",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...env, HARBOUR_PERSONALITY: "quiet" },
    },
    {
      name: "worker",
      command: "pnpm exec tsx tests/e2e/worker.ts",
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
