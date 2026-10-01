import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueScan } from "@/lib/jobs/scan-schedule";
import { getProducts } from "@/lib/products/catalog";

const Body = z.object({ productId: z.string().min(1) });

/** "Scan now": queues a scan of one product for the worker (never runs it here). */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");
  const { productId } = body.data;
  if (!getProducts().some((p) => p.id === productId)) return jsonError(400, "unknown_product");

  const db = getDb();
  const job = enqueueScan(db, productId, session.login);
  audit(db, {
    login: session.login,
    event: "scan_requested",
    detail: { productId, jobId: job.id, created: job.created },
  });
  return Response.json({ jobId: job.id, created: job.created });
}
