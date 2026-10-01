import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { issueSetupToken } from "@/lib/auth/setup-tokens";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");

  const db = getDb();
  const { token, expiresAt } = issueSetupToken(db);
  audit(db, { login: session.login, event: "setup_token_issued", detail: { via: "settings" } });
  const url = new URL("/setup", config.HARBOUR_ORIGIN);
  url.searchParams.set("token", token);
  return Response.json({ url: url.toString(), expiresAt: expiresAt.toISOString() });
}
