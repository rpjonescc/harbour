import * as server from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { passkeys } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import {
  beginAuthentication,
  beginRegistration,
  finishAuthentication,
  finishRegistration,
} from "./passkeys";

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "reg-challenge" })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "auth-challenge" })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: {
        id: "cred-1",
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ["internal"],
      },
    },
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 7 },
  })),
}));

const rp = { id: "pc.tail.ts.net", name: "Harbour", origin: "https://pc.tail.ts.net" };
const login = "owner@example.com";
const t0 = new Date("2026-10-01T00:00:00Z");
// Shapes are irrelevant here: the library is mocked; we test Harbour's handling around it.
const regResponse = { id: "cred-1" } as never;
const authResponse = { id: "cred-1" } as never;

async function registered() {
  const db = openTestDb();
  const { flowId } = await beginRegistration(db, rp, login, t0);
  await finishRegistration(
    db,
    rp,
    { flowId, login, response: regResponse, deviceLabel: "Laptop" },
    t0,
  );
  return db;
}

describe("passkey registration", () => {
  it("stores the verified credential against the login", async () => {
    const db = await registered();
    const row = db.select().from(passkeys).where(eq(passkeys.id, "cred-1")).get();
    expect(row).toMatchObject({
      login,
      deviceLabel: "Laptop",
      counter: 0,
      transports: ["internal"],
    });
  });

  it("reports the new credential id so the session can be linked to it", async () => {
    const db = openTestDb();
    const { flowId } = await beginRegistration(db, rp, login, t0);
    const result = await finishRegistration(
      db,
      rp,
      { flowId, login, response: regResponse, deviceLabel: "Laptop" },
      t0,
    );
    expect(result).toEqual({ ok: true, deviceLabel: "Laptop", credentialId: "cred-1" });
  });

  it("fails with an unknown or reused flow", async () => {
    const db = openTestDb();
    const result = await finishRegistration(
      db,
      rp,
      { flowId: "nope", login, response: regResponse, deviceLabel: "X" },
      t0,
    );
    expect(result).toEqual({ ok: false, reason: "expired_challenge" });
  });

  it("reports a library verification error instead of throwing", async () => {
    vi.mocked(server.verifyRegistrationResponse).mockRejectedValueOnce(
      new Error("bad attestation"),
    );
    const db = openTestDb();
    const { flowId } = await beginRegistration(db, rp, login, t0);
    const result = await finishRegistration(
      db,
      rp,
      { flowId, login, response: regResponse, deviceLabel: "X" },
      t0,
    );
    expect(result).toEqual({ ok: false, reason: "verification_failed" });
    expect(db.select().from(passkeys).all()).toHaveLength(0);
  });
});

describe("passkey authentication", () => {
  it("returns null when the login has no passkeys", async () => {
    expect(await beginAuthentication(openTestDb(), rp, login, t0)).toBeNull();
  });

  it("verifies against the stored credential and updates the counter", async () => {
    const db = await registered();
    const begun = await beginAuthentication(db, rp, login, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(
      db,
      rp,
      { flowId: begun.flowId, login, response: authResponse },
      t0,
    );
    expect(result).toEqual({ ok: true, deviceLabel: "Laptop", credentialId: "cred-1" });
    const row = db.select().from(passkeys).where(eq(passkeys.id, "cred-1")).get();
    expect(row?.counter).toBe(7);
    expect(row?.lastUsedAt).toEqual(t0);
    expect(vi.mocked(server.verifyAuthenticationResponse)).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: "auth-challenge",
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
      }),
    );
  });

  it("rejects a credential that belongs to nobody", async () => {
    const db = await registered();
    const begun = await beginAuthentication(db, rp, login, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(
      db,
      rp,
      { flowId: begun.flowId, login, response: { id: "someone-else" } as never },
      t0,
    );
    expect(result).toEqual({ ok: false, reason: "unknown_credential" });
  });

  it("rejects another login's credential even though it exists", async () => {
    const db = await registered();
    const other = "other@example.com";
    db.insert(passkeys)
      .values({
        id: "cred-other",
        login: other,
        publicKey: Buffer.from([9]),
        counter: 0,
        transports: null,
        deviceLabel: "Theirs",
        createdAt: t0,
        lastUsedAt: null,
      })
      .run();
    const begun = await beginAuthentication(db, rp, other, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(
      db,
      rp,
      { flowId: begun.flowId, login: other, response: authResponse },
      t0,
    );
    expect(result).toEqual({ ok: false, reason: "unknown_credential" });
  });

  it("rejects an unverified assertion", async () => {
    vi.mocked(server.verifyAuthenticationResponse).mockResolvedValueOnce({
      verified: false,
    } as never);
    const db = await registered();
    const begun = await beginAuthentication(db, rp, login, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(
      db,
      rp,
      { flowId: begun.flowId, login, response: authResponse },
      t0,
    );
    expect(result).toEqual({ ok: false, reason: "verification_failed" });
  });
});
