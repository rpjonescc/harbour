import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGscCredentials } from "../collectors/gsc-credentials";
import { ensureWritable, writeAuthorizedUser } from "./write-credentials";

const CREDENTIAL = {
  clientId: "000000000000-example.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-gsc-write-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("writeAuthorizedUser", () => {
  it("writes a file the worker's credentials reader accepts, mode 600", async () => {
    const path = join(dir, "gsc.json");
    await writeAuthorizedUser(path, CREDENTIAL, { force: false });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(readGscCredentials(path)).resolves.toEqual({
      state: "ok",
      credentials: { type: "authorized_user", ...CREDENTIAL },
      warning: null,
    });
    expect(readdirSync(dir)).toEqual(["gsc.json"]);
  });

  it("creates a missing parent folder with mode 700", async () => {
    const parent = join(dir, "harbour-data");
    await writeAuthorizedUser(join(parent, "gsc.json"), CREDENTIAL, { force: false });
    expect(statSync(parent).mode & 0o777).toBe(0o700);
  });

  it("refuses to replace an existing file without force, and leaves it alone", async () => {
    const path = join(dir, "gsc.json");
    writeFileSync(path, "keep me");
    await expect(writeAuthorizedUser(path, CREDENTIAL, { force: false })).rejects.toThrow(
      /already exists.*--force/,
    );
    expect(readdirSync(dir)).toEqual(["gsc.json"]);
    await writeAuthorizedUser(path, CREDENTIAL, { force: true });
    await expect(readGscCredentials(path)).resolves.toMatchObject({ state: "ok" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

describe("ensureWritable", () => {
  it("fails early when the file exists and force is off", async () => {
    const path = join(dir, "gsc.json");
    await expect(ensureWritable(path, false)).resolves.toBeUndefined();
    writeFileSync(path, "{}");
    await expect(ensureWritable(path, false)).rejects.toThrow(/already exists/);
    await expect(ensureWritable(path, true)).resolves.toBeUndefined();
  });
});
