import { getSession } from "@/lib/auth/guard";
import { ensureBrain, requestReindex } from "@/lib/brain/runtime";
import { getConfig } from "@/lib/config";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  if (!(await getSession())) return jsonError(401, "unauthenticated");
  if (!ensureBrain().available) return jsonError(409, "brain_unavailable");
  return Response.json({ started: requestReindex() });
}
