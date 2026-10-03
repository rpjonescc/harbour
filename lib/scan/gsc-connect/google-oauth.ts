import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { z } from "zod";
import { isApiDisabled, readGoogleError, shorten } from "../collectors/google-api";
import { readCappedBody } from "../fetch-body";
import type { OAuthClient } from "./client-file";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SITES_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites";
const TIMEOUT_MS = 15_000;
/** Both answers are a few KiB at most. */
const MAX_BYTES = 256 * 1024;

/** The platform fetch, or a fake one in tests. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** One Search Console property the signed-in account can see. */
export type Site = { siteUrl: string; permissionLevel: string };

type Exchange = { client: OAuthClient; code: string; verifier: string; redirectUri: string };

/** Replaces every secret in `text`; Google sometimes echoes what it was sent. */
function redact(text: string, secrets: string[]): string {
  return secrets.reduce((out, secret) => out.replaceAll(secret, "[redacted]"), text);
}

/** The response's status and body (at most MAX_BYTES), within the timeout; no `cause` on failure. */
async function request(fetch: Fetch, url: string, init: RequestInit, what: string) {
  let status: number;
  let read: { text: string; truncated: boolean };
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = response.status;
    // Streamed and stopped at the cap: an oversized answer is never held whole.
    read = response.body
      ? await readCappedBody(Readable.fromWeb(response.body as NodeReadableStream), MAX_BYTES)
      : { text: "", truncated: false };
  } catch (error) {
    const kind = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "failed";
    throw new Error(`Could not reach ${what}: the request ${kind}.`);
  }
  if (read.truncated) throw new Error(`${what} sent an oversized answer.`);
  return { status, body: read.text };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const tokenError = z.object({ error: z.string(), error_description: z.string().optional() });
const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional() });

const NO_REFRESH_TOKEN =
  "Google returned no refresh token. Remove Harbour's earlier access at " +
  "https://myaccount.google.com/permissions and run pnpm gsc:connect again (it asks with " +
  "prompt=consent, so a fresh grant always includes one).";

/** Trades the authorisation code (with the PKCE verifier) for an access and a refresh token. */
export async function exchangeCode(fetch: Fetch, exchange: Exchange) {
  const { client, code, verifier, redirectUri } = exchange;
  const secrets = [client.clientSecret, code, verifier];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
  });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const what = "Google's token endpoint";
  const response = await request(fetch, TOKEN_ENDPOINT, { method: "POST", headers, body }, what);
  const json = parseJson(response.body);
  if (response.status !== 200) {
    const google = tokenError.safeParse(json);
    const said = google.success
      ? `: ${google.data.error}${google.data.error_description ? ` — ${google.data.error_description}` : ""}`
      : ".";
    throw new Error(
      shorten(redact(`Google refused the sign-in (HTTP ${response.status})${said}`, secrets)),
    );
  }
  const parsed = tokens.safeParse(json);
  if (!parsed.success) throw new Error("Google's token endpoint sent an unexpected answer.");
  if (!parsed.data.refresh_token) throw new Error(NO_REFRESH_TOKEN);
  return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token };
}

const sitesList = z.object({
  siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string() })).optional(),
});

function sitesFailure(status: number, body: string, accessToken: string): Error {
  const google = readGoogleError(body);
  const advice = isApiDisabled(google)
    ? " Enable the Google Search Console API in the OAuth client's Google Cloud project."
    : "";
  // Redact before shortening: a cut through a secret would leave part of it behind.
  const said = google ? ` Google said: ${shorten(redact(google.message, [accessToken]))}` : "";
  return new Error(`Search Console answered HTTP ${status}.${advice}${said}`);
}

/** Search Console `sites.list`: the properties the signed-in account can read. */
export async function listSites(fetch: Fetch, accessToken: string): Promise<Site[]> {
  const init = { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } };
  const response = await request(fetch, SITES_ENDPOINT, init, "Search Console");
  if (response.status !== 200) throw sitesFailure(response.status, response.body, accessToken);
  const parsed = sitesList.safeParse(parseJson(response.body));
  if (!parsed.success) throw new Error("Search Console sent an unexpected list of properties.");
  return parsed.data.siteEntry ?? [];
}
