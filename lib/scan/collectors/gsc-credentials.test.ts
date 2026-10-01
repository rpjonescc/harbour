import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTHORIZED_USER, SERVICE_ACCOUNT } from "@/tests/helpers/gsc";
import { readGscCredentials } from "./gsc-credentials";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-gsc-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Writes `content` to a file in the test directory with `mode`; returns its path. */
function file(content: string, mode = 0o600): string {
  const path = join(dir, "gsc.json");
  writeFileSync(path, content);
  chmodSync(path, mode);
  return path;
}

describe("readGscCredentials", () => {
  it("reads a service account key", async () => {
    const result = await readGscCredentials(file(JSON.stringify(SERVICE_ACCOUNT)));
    expect(result).toEqual({
      state: "ok",
      credentials: {
        type: "service_account",
        clientEmail: SERVICE_ACCOUNT.client_email,
        privateKey: SERVICE_ACCOUNT.private_key,
      },
      warning: null,
    });
  });

  it("reads an OAuth authorized-user file", async () => {
    const result = await readGscCredentials(file(JSON.stringify(AUTHORIZED_USER)));
    expect(result).toEqual({
      state: "ok",
      credentials: {
        type: "authorized_user",
        clientId: AUTHORIZED_USER.client_id,
        clientSecret: AUTHORIZED_USER.client_secret,
        refreshToken: AUTHORIZED_USER.refresh_token,
      },
      warning: null,
    });
  });

  it("warns, but still reads, when other users can read the file", async () => {
    const result = await readGscCredentials(file(JSON.stringify(AUTHORIZED_USER), 0o644));
    expect(result).toMatchObject({
      state: "ok",
      warning:
        "The Search Console credentials file has mode 644, so other users can read it: run chmod 600 on it.",
    });
  });

  it("does not warn for an owner-read-only file", async () => {
    const result = await readGscCredentials(file(JSON.stringify(AUTHORIZED_USER), 0o400));
    expect(result).toMatchObject({ state: "ok", warning: null });
  });

  it("reports a missing file as missing", async () => {
    expect(await readGscCredentials(join(dir, "absent.json"))).toEqual({ state: "missing" });
  });

  it("fails on a file that is not JSON, without quoting it", async () => {
    const run = readGscCredentials(file(`{"client_secret": "${AUTHORIZED_USER.client_secret}"`));
    const error = await run.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("The Search Console credentials file is not valid JSON.");
    expect((error as Error).cause).toBeUndefined();
  });

  it("names the missing fields of an incomplete file, not its values", async () => {
    const { refresh_token: _, ...incomplete } = AUTHORIZED_USER;
    const error = await readGscCredentials(file(JSON.stringify(incomplete))).catch((e) => e);
    expect((error as Error).message).toBe(
      'The Search Console credentials file is not a usable "authorized_user" file ' +
        "(missing or invalid: refresh_token).",
    );
    expect((error as Error).message).not.toContain(AUTHORIZED_USER.client_secret);
  });

  it("refuses a file too large to be a credential, without reading it", async () => {
    const huge = JSON.stringify({ ...AUTHORIZED_USER, padding: "x".repeat(64 * 1024) });
    await expect(readGscCredentials(file(huge))).rejects.toThrow(
      "The Search Console credentials file is larger than 64 KiB: it is not a Google credentials file.",
    );
  });

  it("refuses something that is not a regular file", async () => {
    await expect(readGscCredentials(dir)).rejects.toThrow(
      "The Search Console credentials file is not a regular file.",
    );
  });

  it("refuses other credential types", async () => {
    const run = readGscCredentials(file(JSON.stringify({ type: "external_account" })));
    await expect(run).rejects.toThrow(
      'The Search Console credentials file must be a service account key (type "service_account") ' +
        'or an OAuth authorized-user file (type "authorized_user").',
    );
  });
});
