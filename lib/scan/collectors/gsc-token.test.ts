import { generateKeyPairSync } from "node:crypto";
import { AUTHORIZED_USER, SERVICE_ACCOUNT } from "@/tests/helpers/gsc";
import type { GscCredentials } from "./gsc-credentials";
import { createAccessTokenSource, GSC_SCOPE } from "./gsc-token";

const ACCESS_TOKEN = "test-access-token-xyz";

type Seen = { url: string; body: string };

/** A fake token endpoint answering `status` with `json`; records each request. */
function tokenEndpoint(status: number, json: unknown) {
  const seen: Seen[] = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    seen.push({ url, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(json), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { seen, fetchImplementation };
}

const granted = { access_token: ACCESS_TOKEN, expires_in: 3599, token_type: "Bearer" };

const user: GscCredentials = {
  type: "authorized_user",
  clientId: AUTHORIZED_USER.client_id,
  clientSecret: AUTHORIZED_USER.client_secret,
  refreshToken: AUTHORIZED_USER.refresh_token,
};

const signal = () => new AbortController().signal;

describe("Search Console access tokens", () => {
  it("refreshes an authorized-user credential at Google's token endpoint", async () => {
    const endpoint = tokenEndpoint(200, granted);
    const token = await createAccessTokenSource(endpoint)(user, signal());
    expect(token).toBe(ACCESS_TOKEN);
    expect(endpoint.seen).toHaveLength(1);
    expect(endpoint.seen[0]?.url).toBe("https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(endpoint.seen[0]?.body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe(AUTHORIZED_USER.refresh_token);
  });

  it("signs a JWT for a service account, asking only for read-only Search Console", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const account: GscCredentials = {
      type: "service_account",
      clientEmail: SERVICE_ACCOUNT.client_email,
      privateKey,
    };
    const endpoint = tokenEndpoint(200, granted);
    expect(await createAccessTokenSource(endpoint)(account, signal())).toBe(ACCESS_TOKEN);
    const form = new URLSearchParams(endpoint.seen[0]?.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [, payload = ""] = (form.get("assertion") ?? "").split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(claims).toMatchObject({ iss: SERVICE_ACCOUNT.client_email, scope: GSC_SCOPE });
    expect(GSC_SCOPE).toBe("https://www.googleapis.com/auth/webmasters.readonly");
  });

  it("fails readably on a refused grant, without any secret", async () => {
    const refused = { error: "invalid_grant", error_description: "Token has been revoked." };
    const run = createAccessTokenSource(tokenEndpoint(400, refused))(user, signal());
    const error = await run.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const { message, cause } = error as Error;
    expect(message).toMatch(/^Could not get a Search Console access token: .*invalid_grant/);
    for (const secret of [AUTHORIZED_USER.client_secret, AUTHORIZED_USER.refresh_token]) {
      expect(message).not.toContain(secret);
    }
    expect(cause).toBeUndefined();
  });

  it("never repeats a secret that Google's error echoes back", async () => {
    const echoed = { error: "invalid_client", error_description: AUTHORIZED_USER.client_secret };
    const run = createAccessTokenSource(tokenEndpoint(401, echoed))(user, signal());
    const error = (await run.catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("invalid_client");
    expect(error.message).not.toContain(AUTHORIZED_USER.client_secret);
  });

  it("gives up when the scan is cancelled", async () => {
    const hanging: typeof fetch = () => new Promise(() => {});
    const controller = new AbortController();
    const run = createAccessTokenSource({ fetchImplementation: hanging })(user, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(run).rejects.toThrow("cancelled");
  });
});
