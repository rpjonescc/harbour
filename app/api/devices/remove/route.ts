import { z } from "zod";
import { audit } from "@/lib/audit";
import { removeDevice } from "@/lib/auth/devices";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  if (!removeDevice(db, session.login, body.data.id)) return jsonError(404, "not_found");
  audit(db, { login: session.login, event: "passkey_removed", detail: { id: body.data.id } });
  return Response.json({ ok: true });
}
