import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { requestCancel } from "@/lib/jobs/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return jsonError(404, "not_found");
  const db = getDb();
  const result = requestCancel(db, id);
  if (result !== "not-active") {
    audit(db, { login: session.login, event: "agent_run_cancelled", detail: { jobId: id } });
  }
  return Response.json({ result });
}
