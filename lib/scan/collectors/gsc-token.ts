import { type AuthClient, JWT, UserRefreshClient } from "google-auth-library";
import type { GscCredentials } from "./gsc-credentials";

/** Read-only access to Search Console data; nothing broader. */
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** google-auth-library calls Google's token endpoint itself: bound it like our own requests. */
const TOKEN_TIMEOUT_MS = 30_000;

/** An access token for `credentials`; rejects when `signal` aborts. */
export type AccessTokenSource = (
  credentials: GscCredentials,
  signal: AbortSignal,
) => Promise<string>;

/** Tests swap Google's token endpoint for a fake one; production uses the platform fetch. */
type Transport = { fetchImplementation?: typeof fetch };

function client(credentials: GscCredentials, transport: Transport): AuthClient {
  const transporterOptions = { ...transport, timeout: TOKEN_TIMEOUT_MS, retryConfig: { retry: 1 } };
  if (credentials.type === "service_account") {
    return new JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: [GSC_SCOPE],
      transporterOptions,
    });
  }
  return new UserRefreshClient({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
    transporterOptions,
  });
}

function secretsOf(credentials: GscCredentials): string[] {
  return credentials.type === "service_account"
    ? [credentials.privateKey]
    : [credentials.clientSecret, credentials.refreshToken];
}

/** google-auth-library's message, minus any secret, and no `cause` (it holds the request). */
function tokenFailure(error: unknown, credentials: GscCredentials): Error {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secretsOf(credentials)) message = message.replaceAll(secret, "[redacted]");
  return new Error(`Could not get a Search Console access token: ${message.slice(0, 300)}`);
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.throwIfAborted();
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/** Builds the token source; the worker uses `googleAccessToken`. */
export function createAccessTokenSource(transport: Transport = {}): AccessTokenSource {
  return async (credentials, signal) => {
    const request = client(credentials, transport)
      .getAccessToken()
      .then(({ token }) => {
        if (!token) throw new Error("Google returned no access token");
        return token;
      })
      .catch((error: unknown) => {
        throw tokenFailure(error, credentials);
      });
    return Promise.race([request, aborted(signal)]);
  };
}

/** Access tokens from Google's real token endpoint. */
export const googleAccessToken: AccessTokenSource = createAccessTokenSource();
