import { z } from "zod";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { enqueueWeeklyAnalyst } from "@/lib/analyst/schedule";
import { isoWeekLabel } from "@/lib/analyst/week";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueJob } from "@/lib/jobs/queue";
import { getProducts } from "@/lib/products/catalog";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research"), topic: z.string().min(1) }),
  z.object({ kind: z.literal("discovery"), productId: z.string().min(1) }),
  // Strict: the week is always this local week, computed here, never taken from the client.
  z.strictObject({ kind: z.literal("weekly-analyst") }),
]);
type Body = z.infer<typeof Body>;
type Queued = { jobIds: number[]; detail?: Record<string, string> };

function queueRun(body: Body, login: string, timeZone: string): Queued | Response {
  const db = getDb();
  if (body.kind === "weekly-analyst") {
    const week = isoWeekLabel(isoDateIn(timeZone, new Date()));
    return { jobIds: [enqueueWeeklyAnalyst(db, week, login).id], detail: { week } };
  }
  if (body.kind === "discovery") {
    const { productId } = body;
    if (!getProducts().some((p) => p.id === productId)) return jsonError(400, "unknown_product");
    return { jobIds: [enqueueJob(db, "discovery", { productId }, login).id] };
  }
  const { topic } = body;
  if (topic !== "all" && !RESEARCH_TOPICS.some((t) => t.id === topic)) {
    return jsonError(400, "unknown_topic");
  }
  const topics = topic === "all" ? RESEARCH_TOPICS.map((t) => t.id) : [topic];
  return { jobIds: topics.map((id) => enqueueJob(db, "research", { topic: id }, login).id) };
}

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");
  // Every kind is an agent run, which would only fail in the worker without a token.
  if (!config.HARBOUR_CLAUDE_OAUTH_TOKEN) return jsonError(409, "token_missing");

  const queued = queueRun(body.data, session.login, config.HARBOUR_TIMEZONE);
  if (queued instanceof Response) return queued;
  const { jobIds, detail } = queued;
  audit(getDb(), {
    login: session.login,
    event: "agent_run_requested",
    detail: { ...body.data, ...detail, jobIds },
  });
  return Response.json({ jobIds });
}
