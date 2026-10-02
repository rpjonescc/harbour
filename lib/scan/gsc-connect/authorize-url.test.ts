import { createHash } from "node:crypto";
import { authorizeUrl, createPkce, createState } from "./authorize-url";

describe("createPkce", () => {
  it("makes a fresh 43+ character verifier and its S256 challenge", () => {
    const pkce = createPkce();
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const expected = createHash("sha256").update(pkce.verifier).digest("base64url");
    expect(pkce.challenge).toBe(expected);
    expect(createPkce().verifier).not.toBe(pkce.verifier);
  });
});

describe("createState", () => {
  it("is random and URL-safe", () => {
    const state = createState();
    expect(state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(createState()).not.toBe(state);
  });
});

describe("authorizeUrl", () => {
  it("asks for offline, read-only Search Console access with PKCE and state", () => {
    const url = new URL(
      authorizeUrl({
        clientId: "000-example.apps.googleusercontent.com",
        redirectUri: "http://127.0.0.1:4567/callback",
        challenge: "challenge-value",
        state: "state-value",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "000-example.apps.googleusercontent.com",
      redirect_uri: "http://127.0.0.1:4567/callback",
      response_type: "code",
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      access_type: "offline",
      prompt: "consent",
      code_challenge: "challenge-value",
      code_challenge_method: "S256",
      state: "state-value",
    });
  });
});
