import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import {
  FLOW_COOKIE,
  flowCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { listDevices, uniqueDeviceLabel } from "@/lib/auth/devices";
import { finishRegistration } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({
  deviceLabel: z.string().trim().min(1).max(60),
  response: z.looseObject({ id: z.string().min(1) }),
});

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const jar = await cookies();
  const flowId = jar.get(FLOW_COOKIE)?.value;
  // The flow cookie is scoped to /api/auth; deleting without the path would leave it set.
  jar.delete({ name: FLOW_COOKIE, path: flowCookieOptions().path });
  if (!flowId) return jsonError(400, "expired_challenge");

  const db = getDb();
  const deviceLabel = uniqueDeviceLabel(
    listDevices(db, login).map((device) => device.deviceLabel),
    body.data.deviceLabel,
  );
  const result = await finishRegistration(db, relyingParty(config), {
    flowId,
    login,
    response: body.data.response as unknown as RegistrationResponseJSON,
    deviceLabel,
  });
  if (!result.ok) return jsonError(400, result.reason);

  audit(db, { login, event: "passkey_registered", detail: { device: result.deviceLabel } });
  // Rotate: never leave a previous session alive alongside the new one.
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous) revokeSession(db, previous);
  const session = createSession(db, login, result.credentialId);
  jar.set(SESSION_COOKIE, session.token, sessionCookieOptions());
  return Response.json({
    ok: true,
    deviceLabel,
    renamed: deviceLabel !== body.data.deviceLabel.trim(),
  });
}
