import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import {
  FLOW_COOKIE,
  flowCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { finishAuthentication } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({ response: z.looseObject({ id: z.string().min(1) }) });

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
  const result = await finishAuthentication(db, relyingParty(config), {
    flowId,
    login,
    response: body.data.response as unknown as AuthenticationResponseJSON,
  });
  if (!result.ok) {
    audit(db, { login, event: "login_failed", detail: { reason: result.reason } });
    return jsonError(401, result.reason);
  }

  audit(db, { login, event: "login", detail: { device: result.deviceLabel } });
  // Rotate: never leave a previous session alive alongside the new one.
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous) revokeSession(db, previous);
  const session = createSession(db, login, result.credentialId);
  jar.set(SESSION_COOKIE, session.token, sessionCookieOptions());
  return Response.json({ ok: true });
}
