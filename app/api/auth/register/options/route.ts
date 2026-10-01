import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { FLOW_COOKIE, flowCookieOptions } from "@/lib/auth/cookies";
import { beginRegistration } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { consumeSetupToken } from "@/lib/auth/setup-tokens";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({ setupToken: z.string().min(1) });

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  if (!consumeSetupToken(db, body.data.setupToken)) {
    audit(db, { login, event: "setup_token_rejected" });
    return jsonError(401, "invalid_setup_token");
  }
  const { flowId, options } = await beginRegistration(db, relyingParty(config), login);
  (await cookies()).set(FLOW_COOKIE, flowId, flowCookieOptions());
  return Response.json(options);
}
