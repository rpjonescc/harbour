import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DESKTOP_CLIENT, WEB_CLIENT } from "@/tests/helpers/gsc-connect";
import { parseOAuthClient, readOAuthClient } from "./client-file";

describe("parseOAuthClient", () => {
  it("reads a Desktop app client", () => {
    expect(parseOAuthClient(JSON.stringify(DESKTOP_CLIENT))).toEqual({
      clientId: DESKTOP_CLIENT.installed.client_id,
      clientSecret: DESKTOP_CLIENT.installed.client_secret,
    });
  });

  it("refuses a Web application client, saying why", () => {
    expect(() => parseOAuthClient(JSON.stringify(WEB_CLIENT))).toThrow(
      /Web application.*Desktop app/,
    );
  });

  it("refuses invalid JSON and names missing fields, never values", () => {
    expect(() => parseOAuthClient("{")).toThrow(/not valid JSON/);
    const noSecret = { installed: { client_id: "abc.apps.googleusercontent.com" } };
    expect(() => parseOAuthClient(JSON.stringify(noSecret))).toThrow(/client_secret/);
    expect(() => parseOAuthClient(JSON.stringify({ type: "authorized_user" }))).toThrow(
      /Desktop app/,
    );
  });

  it("keeps the secret out of its errors", () => {
    const bad = {
      installed: { client_id: "", client_secret: DESKTOP_CLIENT.installed.client_secret },
    };
    expect(() => parseOAuthClient(JSON.stringify(bad))).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(DESKTOP_CLIENT.installed.client_secret),
      }),
    );
  });
});

describe("readOAuthClient", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "harbour-gsc-client-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the downloaded client file", async () => {
    const path = join(dir, "client.json");
    writeFileSync(path, JSON.stringify(DESKTOP_CLIENT));
    await expect(readOAuthClient(path)).resolves.toMatchObject({
      clientId: DESKTOP_CLIENT.installed.client_id,
    });
  });

  it("says when the file is missing or too big", async () => {
    await expect(readOAuthClient(join(dir, "nope.json"))).rejects.toThrow(
      /could not be read \(ENOENT\)/,
    );
    const big = join(dir, "big.json");
    writeFileSync(big, "x".repeat(70 * 1024));
    await expect(readOAuthClient(big)).rejects.toThrow(/larger than 64 KiB/);
  });
});
