import { cookies } from "next/headers";
import { FLOW_COOKIE, flowCookieOptions } from "@/lib/auth/cookies";
import { beginAuthentication } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");

  const begun = await beginAuthentication(getDb(), relyingParty(config), login);
  if (!begun) return jsonError(404, "no_passkeys");
  (await cookies()).set(FLOW_COOKIE, begun.flowId, flowCookieOptions());
  return Response.json(begun.options);
}
