import { createHash, randomBytes } from "node:crypto";
import { GSC_SCOPE } from "../collectors/gsc-token";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** A PKCE pair (RFC 7636): the verifier stays here, Google only ever sees its S256 challenge. */
export type Pkce = { verifier: string; challenge: string };

/** A fresh PKCE verifier (43 base64url characters from 32 random bytes) and its challenge. */
export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** A random value tying Google's callback to this sign-in. */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}

type AuthorizeParams = { clientId: string; redirectUri: string; challenge: string; state: string };

/**
 * Google's consent URL for read-only Search Console access. `access_type=offline` asks for a
 * refresh token; `prompt=consent` makes Google issue one even if this client was approved before.
 */
export function authorizeUrl({ clientId, redirectUri, challenge, state }: AuthorizeParams): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  return url.toString();
}
