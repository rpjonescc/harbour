import { z } from "zod";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueJob } from "@/lib/jobs/queue";
import { getProducts } from "@/lib/products/catalog";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research"), topic: z.string().min(1) }),
  z.object({ kind: z.literal("discovery"), productId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");
  // Both kinds are agent runs, which would only fail in the worker without a token.
  if (!config.HARBOUR_CLAUDE_OAUTH_TOKEN) return jsonError(409, "token_missing");

  const db = getDb();
  const enqueue = (kind: "research" | "discovery", params: Record<string, string>) =>
    enqueueJob(db, kind, params, session.login).id;
  let jobIds: number[];
  if (body.data.kind === "research") {
    const { topic } = body.data;
    if (topic !== "all" && !RESEARCH_TOPICS.some((t) => t.id === topic)) {
      return jsonError(400, "unknown_topic");
    }
    const topics = topic === "all" ? RESEARCH_TOPICS.map((t) => t.id) : [topic];
    jobIds = topics.map((id) => enqueue("research", { topic: id }));
  } else {
    const { productId } = body.data;
    if (!getProducts().some((p) => p.id === productId)) return jsonError(400, "unknown_product");
    jobIds = [enqueue("discovery", { productId })];
  }
  audit(db, {
    login: session.login,
    event: "agent_run_requested",
    detail: { ...body.data, jobIds },
  });
  return Response.json({ jobIds });
}
