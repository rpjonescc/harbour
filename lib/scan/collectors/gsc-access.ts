import type { FetchError } from "../fetch-error";
import type { CollectContext, CollectorResult } from "../types";
import { type GoogleError, isApiDisabled, readGoogleError, shorten } from "./google-api";
import { type GscCredentials, readGscCredentials } from "./gsc-credentials";
import type { AccessTokenSource } from "./gsc-token";

// What the Search Console collectors share: whether they can run at all (credentials, property,
// token) and how a failed request is reduced to a fixed sentence.

export const GSC_TIMEOUT_MS = 30_000;
/** A report or an inspection is a few KiB; 1 MiB leaves room without trusting the answer. */
export const GSC_MAX_BYTES = 1024 * 1024;
const GUIDE = 'see "Connect Search Console" in README.md';

const NO_CREDENTIALS =
  "Set HARBOUR_GSC_CREDENTIALS in .env to the path of a Google credentials JSON file " +
  `(mode 600) and restart the worker: ${GUIDE}.`;
const MISSING_FILE =
  "HARBOUR_GSC_CREDENTIALS names a file that does not exist: save the Google credentials " +
  `JSON there with mode 600; ${GUIDE}.`;

const noProperty = (productId: string) =>
  `Add "searchConsoleProperty" to the "${productId}" product in harbour.config.json, e.g. ` +
  '"sc-domain:example.com" or "https://www.example.com/", and restart the worker.';

/** What a request needs: the property, a bearer token and who to share the property with. */
export type GscAccess = {
  property: string;
  token: string;
  who: string;
  /** Why the credentials file's permissions are unsafe, or null. */
  warning: string | null;
};

/** Whose access Search Console checks, for the "share the property" advice. */
function account(credentials: GscCredentials): string {
  return credentials.type === "service_account"
    ? credentials.clientEmail
    : "the Google account that authorised the OAuth client";
}

/**
 * Credentials, property and token for a product, or the not_configured result saying what is
 * missing. Logs the credentials file's permission warning.
 */
export async function gscAccess(
  ctx: CollectContext,
  accessToken: AccessTokenSource,
): Promise<{ access: GscAccess } | { notConfigured: CollectorResult }> {
  const notConfigured = (reason: string) => ({
    notConfigured: { status: "not_configured", reason } as const,
  });
  const path = ctx.config.HARBOUR_GSC_CREDENTIALS;
  if (!path) return notConfigured(NO_CREDENTIALS);
  const property = ctx.product.searchConsoleProperty;
  if (!property) return notConfigured(noProperty(ctx.product.id));
  const file = await readGscCredentials(path);
  if (file.state === "missing") return notConfigured(MISSING_FILE);
  if (file.warning) ctx.log(file.warning);
  const token = await accessToken(file.credentials, ctx.signal);
  return { access: { property, token, who: account(file.credentials), warning: file.warning } };
}

function accessFailure(status: number, google: GoogleError | null, access: GscAccess) {
  const said = google ? ` Google said: ${shorten(google.message)}` : "";
  if (isApiDisabled(google)) {
    return new Error(
      `Search Console API is not enabled (HTTP ${status}): enable the Google Search Console API ` +
        `in the credential's Google Cloud project.${said}`,
    );
  }
  return new Error(
    `Search Console refused access to ${access.property} (HTTP ${status}): check the property ` +
      `is shared with the credential's account (${access.who}).${said}`,
  );
}

/** Whether Google's answer says the day's quota is used up. */
export function isQuotaFailure(status: number, body: string): boolean {
  return status === 429 || (readGoogleError(body)?.quota ?? false);
}

/** The Error for a non-2xx answer; never carries the request or the token. */
export function httpFailure(status: number, body: string, access: GscAccess): Error {
  const google = readGoogleError(body);
  if (status === 401 || status === 403) return accessFailure(status, google, access);
  const detail = google ? `: ${shorten(google.message)}` : ".";
  if (isQuotaFailure(status, body)) {
    return new Error(
      `Search Console quota exceeded (HTTP ${status})${detail} Wait for tomorrow's scan.`,
    );
  }
  return new Error(`Search Console answered HTTP ${status}${detail}`);
}

/** No `cause`: the FetchError's message has the request URL, and the token rode along. */
export function fetchFailure(error: FetchError): Error {
  if (error.kind === "timeout") {
    return new Error(`Search Console did not answer within ${GSC_TIMEOUT_MS / 1000} s`);
  }
  return new Error(`Search Console request failed (${error.kind})`);
}
