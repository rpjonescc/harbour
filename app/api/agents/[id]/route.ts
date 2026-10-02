import { jobLabel } from "@/lib/agents/view";
import { getSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { eventsSince, getJob } from "@/lib/jobs/queue";
import { getNamedProducts } from "@/lib/products/catalog";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return jsonError(401, "unauthenticated");
  const id = Number((await params).id);
  const db = getDb();
  const job = Number.isInteger(id) ? getJob(db, id) : undefined;
  if (!job) return jsonError(404, "not_found");
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0") || 0;
  const { kind, status, error, createdAt, startedAt, finishedAt } = job;
  return Response.json({
    job: {
      id,
      kind,
      status,
      error,
      label: jobLabel(job, getNamedProducts()),
      createdAt,
      startedAt,
      finishedAt,
    },
    events: eventsSince(db, id, after),
  });
}
