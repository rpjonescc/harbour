import { authorizeUrl, createPkce, createState } from "./authorize-url";
import { readOAuthClient } from "./client-file";
import { exchangeCode, type Fetch, listSites, type Site } from "./google-oauth";
import { startLoopback } from "./loopback";
import { ensureWritable, writeAuthorizedUser } from "./write-credentials";

export type ConnectOptions = {
  /** The downloaded Desktop app OAuth client JSON. */
  clientPath: string;
  /** Where to write the authorized-user credentials file. */
  outPath: string;
  force: boolean;
  /** `searchConsoleProperty` values from harbour.config.json, to check against the account. */
  properties: readonly string[];
};

export type ConnectDeps = {
  fetch: Fetch;
  /** Tries to show the consent page; the URL is printed too, so failing to open is fine. */
  openBrowser: (url: string) => void;
  /** Prints one line for the owner. Never given a secret. */
  log: (line: string) => void;
  timeoutMs?: number;
};

const FIVE_MINUTES = 5 * 60_000;

function reportSites(sites: Site[], properties: readonly string[], log: (line: string) => void) {
  if (sites.length === 0) {
    log("This Google account sees no Search Console properties: sign in with one that does.");
  } else {
    log("Search Console properties this account can read:");
    for (const site of sites) log(`  ${site.siteUrl} (${site.permissionLevel})`);
  }
  const visible = new Set(sites.map((site) => site.siteUrl));
  const unlisted = properties.filter((property) => !visible.has(property));
  if (unlisted.length === 0) return;
  log("Configured in harbour.config.json but not in this account's list:");
  for (const property of unlisted) log(`  ${property}`);
  log(
    'Check each "searchConsoleProperty" matches a URL above exactly, or share it with this account.',
  );
}

/** Waits for the owner to sign in and returns the code with the redirect it was issued for. */
async function signIn(clientId: string, deps: ConnectDeps) {
  const pkce = createPkce();
  const state = createState();
  const loopback = await startLoopback({ state, timeoutMs: deps.timeoutMs ?? FIVE_MINUTES });
  const url = authorizeUrl({
    clientId,
    redirectUri: loopback.redirectUri,
    challenge: pkce.challenge,
    state,
  });
  deps.log("Open this link and sign in with the Google account that sees your properties:");
  deps.log(url);
  deps.openBrowser(url);
  deps.log("Waiting for Google (up to 5 minutes)…");
  return { code: await loopback.code, verifier: pkce.verifier, redirectUri: loopback.redirectUri };
}

/**
 * Connects Search Console with the owner's own Google sign-in: PKCE loopback consent for the
 * read-only scope, a sites.list check, then an authorized-user file the worker can read.
 */
export async function connectSearchConsole(options: ConnectOptions, deps: ConnectDeps) {
  const client = await readOAuthClient(options.clientPath);
  await ensureWritable(options.outPath, options.force);
  const { code, verifier, redirectUri } = await signIn(client.clientId, deps);
  const tokens = await exchangeCode(deps.fetch, { client, code, verifier, redirectUri });
  reportSites(await listSites(deps.fetch, tokens.accessToken), options.properties, deps.log);
  await writeAuthorizedUser(
    options.outPath,
    { ...client, refreshToken: tokens.refreshToken },
    { force: options.force },
  );
  deps.log(`Saved the Search Console credentials to ${options.outPath} (mode 600).`);
  deps.log("Next: in .env set");
  deps.log(`  HARBOUR_GSC_CREDENTIALS=${options.outPath}`);
  deps.log("then restart the worker (systemctl --user restart harbour-worker).");
  deps.log("You can revoke this access any time at https://myaccount.google.com/permissions.");
}
