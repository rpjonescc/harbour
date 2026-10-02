import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DESKTOP_CLIENT, WEB_CLIENT } from "@/tests/helpers/gsc-connect";
import { readGscCredentials } from "../collectors/gsc-credentials";
import { type ConnectDeps, connectSearchConsole } from "./connect";

const CODE = "fake-authorisation-code";
const ACCESS = "fake-access-token";
const REFRESH = "fake-refresh-token";
const SECRET = DESKTOP_CLIENT.installed.client_secret;
const SITES = {
  siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }],
};

let dir: string;
let lines: string[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-gsc-connect-"));
  lines = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function clientFile(content: unknown = DESKTOP_CLIENT): string {
  const path = join(dir, "client.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

type Fake = { token?: unknown; sites?: unknown };

/** Google, faked: the browser "signs in" by calling the loopback, and both APIs answer. */
function deps(fake: Fake = {}): ConnectDeps & { verifierSent: () => string | null } {
  let challenge = "";
  let verifier: string | null = null;
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target === "https://oauth2.googleapis.com/token") {
      verifier = new URLSearchParams(String(init?.body)).get("code_verifier");
      const body = fake.token ?? { access_token: ACCESS, refresh_token: REFRESH };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (target === "https://www.googleapis.com/webmasters/v3/sites") {
      return new Response(JSON.stringify(fake.sites ?? SITES), { status: 200 });
    }
    throw new Error(`unexpected request to ${target}`);
  });
  return {
    fetch,
    log: (line) => lines.push(line),
    openBrowser: (authorize) => {
      const params = new URL(authorize).searchParams;
      challenge = params.get("code_challenge") ?? "";
      const callback = `${params.get("redirect_uri")}?state=${params.get("state")}&code=${CODE}`;
      void globalThis.fetch(callback);
    },
    verifierSent: () =>
      verifier && createHash("sha256").update(verifier).digest("base64url") === challenge
        ? verifier
        : null,
  };
}

const output = () => lines.join("\n");

describe("connectSearchConsole", () => {
  it("signs in with PKCE, verifies access and writes the credentials file", async () => {
    const out = join(dir, "data", "gsc.json");
    const fake = deps();
    await connectSearchConsole(
      {
        clientPath: clientFile(),
        outPath: out,
        force: false,
        properties: ["sc-domain:example.com"],
      },
      fake,
    );
    expect(fake.verifierSent()).not.toBeNull();
    await expect(readGscCredentials(out)).resolves.toEqual({
      state: "ok",
      credentials: {
        type: "authorized_user",
        clientId: DESKTOP_CLIENT.installed.client_id,
        clientSecret: SECRET,
        refreshToken: REFRESH,
      },
      warning: null,
    });
    expect(statSync(out).mode & 0o777).toBe(0o600);
    expect(output()).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(output()).toContain("sc-domain:example.com (siteOwner)");
    expect(output()).toContain(`HARBOUR_GSC_CREDENTIALS=${out}`);
    expect(output()).toMatch(/restart the worker/i);
  });

  it("never prints the client secret, code, access token or refresh token", async () => {
    await connectSearchConsole(
      { clientPath: clientFile(), outPath: join(dir, "gsc.json"), force: false, properties: [] },
      deps(),
    );
    for (const secret of [SECRET, CODE, ACCESS, REFRESH]) expect(output()).not.toContain(secret);
  });

  it("flags configured properties the account cannot see", async () => {
    const properties = ["sc-domain:example.com", "https://shop.example.net/"];
    await connectSearchConsole(
      { clientPath: clientFile(), outPath: join(dir, "gsc.json"), force: false, properties },
      deps(),
    );
    expect(output()).toMatch(/not in this account's list.*\n.*https:\/\/shop\.example\.net\//);
    expect(output()).not.toMatch(/not in this account's list.*\n.*sc-domain:example\.com/);
  });

  it("refuses a Web application client before opening the browser", async () => {
    const fake = deps();
    const opened = vi.spyOn(fake, "openBrowser");
    await expect(
      connectSearchConsole(
        {
          clientPath: clientFile(WEB_CLIENT),
          outPath: join(dir, "gsc.json"),
          force: false,
          properties: [],
        },
        fake,
      ),
    ).rejects.toThrow(/Desktop app/);
    expect(opened).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing file before signing in, unless forced", async () => {
    const out = join(dir, "gsc.json");
    writeFileSync(out, "{}");
    const fake = deps();
    const opened = vi.spyOn(fake, "openBrowser");
    const options = { clientPath: clientFile(), outPath: out, force: false, properties: [] };
    await expect(connectSearchConsole(options, fake)).rejects.toThrow(/--force/);
    expect(opened).not.toHaveBeenCalled();
    await connectSearchConsole({ ...options, force: true }, deps());
    await expect(readGscCredentials(out)).resolves.toMatchObject({ state: "ok" });
  });

  it("writes nothing when Google returns no refresh token", async () => {
    const out = join(dir, "gsc.json");
    await expect(
      connectSearchConsole(
        { clientPath: clientFile(), outPath: out, force: false, properties: [] },
        deps({ token: { access_token: ACCESS } }),
      ),
    ).rejects.toThrow(/no refresh token/);
    expect(existsSync(out)).toBe(false);
  });

  it("times out when the browser never comes back", async () => {
    const fake = { ...deps(), openBrowser: () => {}, timeoutMs: 50 };
    await expect(
      connectSearchConsole(
        { clientPath: clientFile(), outPath: join(dir, "gsc.json"), force: false, properties: [] },
        fake,
      ),
    ).rejects.toThrow(/No answer from Google sign-in/);
  });
});
