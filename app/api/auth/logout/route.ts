import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { requestLogin } from "@/lib/auth/request";
import { revokeSession } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = getDb();
    revokeSession(db, token);
    audit(db, { login: requestLogin(request), event: "logout" });
  }
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
