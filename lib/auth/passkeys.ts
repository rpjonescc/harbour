import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { passkeys } from "@/lib/db/schema";
import { consumeChallenge, saveChallenge } from "./challenges";
import type { RelyingParty } from "./relying-party";

export type CeremonyResult =
  | { ok: true; deviceLabel: string; credentialId: string }
  | { ok: false; reason: "expired_challenge" | "unknown_credential" | "verification_failed" };

function credentialsFor(db: Db, login: string) {
  return db.select().from(passkeys).where(eq(passkeys.login, login)).all();
}

/** Starts registering a new passkey. Callers must have consumed a setup token first. */
export async function beginRegistration(db: Db, rp: RelyingParty, login: string, now = new Date()) {
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: login,
    attestationType: "none",
    excludeCredentials: credentialsFor(db, login).map((c) => ({
      id: c.id,
      transports: c.transports ?? undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  const flowId = saveChallenge(db, { kind: "register", login, challenge: options.challenge }, now);
  return { flowId, options };
}

/** Verifies the browser's registration response and stores the credential. */
export async function finishRegistration(
  db: Db,
  rp: RelyingParty,
  input: { flowId: string; login: string; response: RegistrationResponseJSON; deviceLabel: string },
  now = new Date(),
): Promise<CeremonyResult> {
  const challenge = consumeChallenge(
    db,
    { flowId: input.flowId, kind: "register", login: input.login },
    now,
  );
  if (!challenge) return { ok: false, reason: "expired_challenge" };
  try {
    const result = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
    if (!result.verified) return { ok: false, reason: "verification_failed" };
    const { credential } = result.registrationInfo;
    db.insert(passkeys)
      .values({
        id: credential.id,
        login: input.login,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceLabel: input.deviceLabel,
        createdAt: now,
        lastUsedAt: null,
      })
      .run();
    return { ok: true, deviceLabel: input.deviceLabel, credentialId: credential.id };
  } catch (error) {
    console.error("passkey registration failed", error);
    return { ok: false, reason: "verification_failed" };
  }
}

/** Starts a sign-in ceremony; null when the login has no passkeys yet. */
export async function beginAuthentication(
  db: Db,
  rp: RelyingParty,
  login: string,
  now = new Date(),
) {
  const credentials = credentialsFor(db, login);
  if (credentials.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports ?? undefined })),
  });
  const flowId = saveChallenge(
    db,
    { kind: "authenticate", login, challenge: options.challenge },
    now,
  );
  return { flowId, options };
}

/** Verifies a sign-in assertion and advances the credential's signature counter. */
export async function finishAuthentication(
  db: Db,
  rp: RelyingParty,
  input: { flowId: string; login: string; response: AuthenticationResponseJSON },
  now = new Date(),
): Promise<CeremonyResult> {
  const challenge = consumeChallenge(
    db,
    { flowId: input.flowId, kind: "authenticate", login: input.login },
    now,
  );
  if (!challenge) return { ok: false, reason: "expired_challenge" };
  const where = and(eq(passkeys.id, input.response.id), eq(passkeys.login, input.login));
  const stored = db.select().from(passkeys).where(where).get();
  if (!stored) return { ok: false, reason: "unknown_credential" };
  try {
    const result = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ?? undefined,
      },
    });
    if (!result.verified) return { ok: false, reason: "verification_failed" };
    db.update(passkeys)
      .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: now })
      .where(where)
      .run();
    return { ok: true, deviceLabel: stored.deviceLabel, credentialId: stored.id };
  } catch (error) {
    console.error("passkey authentication failed", error);
    return { ok: false, reason: "verification_failed" };
  }
}
