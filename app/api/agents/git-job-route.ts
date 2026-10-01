import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueJob } from "@/lib/jobs/queue";

/** Shared handler for the parameterless git jobs ("Retry now", "Save now"). */
export async function enqueueGitJob(
  request: Request,
  kind: "brain-push" | "notes-sync",
): Promise<Response> {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  return Response.json({ jobId: enqueueJob(getDb(), kind, {}, session.login).id });
}
