import { exchangeCode, listSites } from "./google-oauth";

const CLIENT = {
  clientId: "000-example.apps.googleusercontent.com",
  clientSecret: "client-secret-x",
};
const EXCHANGE = {
  client: CLIENT,
  code: "auth-code-x",
  verifier: "verifier-x",
  redirectUri: "http://127.0.0.1:4567/callback",
};

/** The error `promise` rejects with; fails the test if it resolves. */
async function failure(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof Error)) throw new Error("expected a rejection with an Error");
  return error;
}

function respond(status: number, body: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

describe("exchangeCode", () => {
  it("posts the code, verifier and client to Google's token endpoint", async () => {
    const fetch = respond(200, {
      access_token: "access-x",
      refresh_token: "refresh-x",
      expires_in: 3599,
    });
    await expect(exchangeCode(fetch, EXCHANGE)).resolves.toEqual({
      accessToken: "access-x",
      refreshToken: "refresh-x",
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "authorization_code",
      code: "auth-code-x",
      code_verifier: "verifier-x",
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
      redirect_uri: EXCHANGE.redirectUri,
    });
  });

  it("requires a refresh token and explains how to get one", async () => {
    const fetch = respond(200, { access_token: "access-x", expires_in: 3599 });
    await expect(exchangeCode(fetch, EXCHANGE)).rejects.toThrow(
      /no refresh token.*myaccount\.google\.com\/permissions/s,
    );
  });

  it("reports Google's error with every secret redacted", async () => {
    const fetch = respond(400, {
      error: "invalid_grant",
      error_description: "Bad code auth-code-x for client-secret-x verifier-x",
    });
    const { message } = await failure(exchangeCode(fetch, EXCHANGE));
    expect(message).toMatch(/HTTP 400.*invalid_grant/);
    for (const secret of ["auth-code-x", "client-secret-x", "verifier-x"]) {
      expect(message).not.toContain(secret);
    }
  });

  it("redacts before shortening, so a cut can't leave part of a secret", async () => {
    // Slide the secret across the 300-character cut.
    for (let pad = 220; pad < 260; pad++) {
      const fetch = respond(400, {
        error: "invalid_grant",
        error_description: `${"x".repeat(pad)}client-secret-x`,
      });
      const { message } = await failure(exchangeCode(fetch, EXCHANGE));
      expect(message).not.toContain("client-secr");
    }
  });

  it("reports a network failure without its cause", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await failure(exchangeCode(fetch, EXCHANGE));
    expect(error.message).toMatch(/Could not reach Google's token endpoint/);
    expect(error.cause).toBeUndefined();
  });
});

describe("listSites", () => {
  it("lists the account's properties with the access token", async () => {
    const fetch = respond(200, {
      siteEntry: [
        { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
        { siteUrl: "https://www.example.org/", permissionLevel: "siteRestrictedUser" },
      ],
    });
    await expect(listSites(fetch, "access-x")).resolves.toEqual([
      { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
      { siteUrl: "https://www.example.org/", permissionLevel: "siteRestrictedUser" },
    ]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-x");
  });

  it("treats an account without properties as an empty list", async () => {
    await expect(listSites(respond(200, {}), "access-x")).resolves.toEqual([]);
  });

  it("explains a disabled API and keeps the token out of errors", async () => {
    const fetch = respond(403, {
      error: {
        code: 403,
        message: "API disabled for access-x",
        errors: [{ reason: "accessNotConfigured" }],
      },
    });
    const error = await failure(listSites(fetch, "access-x"));
    expect(error.message).toMatch(/HTTP 403.*Google Search Console API/);
    expect(error.message).not.toContain("access-x");
  });
});
