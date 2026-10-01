import { z } from "zod";
import { enqueueResearch, queueRefreshes } from "@/lib/agents/refresh-schedule";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { enqueueWeeklyAnalyst } from "@/lib/analyst/schedule";
import { isoWeekLabel } from "@/lib/analyst/week";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { type Config, getConfig } from "@/lib/config";
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
  // Strict: which documents are stale is read from the brain here, never taken from the client.
  z.strictObject({ kind: z.literal("refresh") }),
]);
type Body = z.infer<typeof Body>;
type Queued = {
  jobIds: number[];
  /** Added to the audit entry. */
  detail?: Record<string, unknown>;
  /** Added to the response. */
  extra?: Record<string, unknown>;
};

function queueRun(body: Body, login: string, config: Config): Queued | Response {
  const db = getDb();
  const timeZone = config.HARBOUR_TIMEZONE;
  if (body.kind === "refresh") {
    const now = new Date();
    const { queued, stale } = queueRefreshes(db, {
      root: config.HARBOUR_BRAIN_DIR,
      today: isoDateIn(timeZone, now),
      requestedBy: login,
      month: null,
      now,
    });
    return {
      jobIds: queued.map((q) => q.jobId),
      detail: { topics: queued.map((q) => q.topicId) },
      extra: { stale },
    };
  }
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
  // A topic already being researched or refreshed keeps its run instead of gaining a second.
  return { jobIds: enqueueResearch(db, topics, login) };
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

  const queued = queueRun(body.data, session.login, config);
  if (queued instanceof Response) return queued;
  const { jobIds, detail, extra } = queued;
  audit(getDb(), {
    login: session.login,
    event: "agent_run_requested",
    detail: { ...body.data, ...detail, jobIds },
  });
  return Response.json({ jobIds, ...extra });
}
