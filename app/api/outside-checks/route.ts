import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { OUTSIDE_CHECK_REFUSALS } from "@/lib/explain/outside-check";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { requestOutsideCheck } from "@/lib/jobs/outside-check";
import { getProducts, getTracking } from "@/lib/products/catalog";

// Nothing but the product, named as the config names it (a lowercase slug, at most 200 characters):
// any other key is refused.
const Body = z.strictObject({ productId: z.string().regex(/^[a-z0-9-]{1,200}$/) });
const MAX_BODY = 1_000;

/** "Run this check now": queues an outside-view check of one product (never runs it here). */
export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return jsonError(413, "too_large");
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const body = Body.safeParse(json);
  if (!body.success) return jsonError(400, "invalid_request");
  const { productId } = body.data;
  if (!getProducts().some((p) => p.id === productId)) return jsonError(400, "unknown_product");

  const db = getDb();
  const now = new Date();
  const result = requestOutsideCheck({
    db,
    config,
    now,
    login: session.login,
    productId,
    tracking: getTracking(productId),
  });
  if (!result.ok) {
    // Refused requests are audited too, with why; the message is fixed text with nothing from the request.
    audit(
      db,
      {
        login: session.login,
        event: "outside_check_requested",
        detail: { productId, refused: result.reason },
      },
      now,
    );
    const status =
      result.reason === "too_soon" || result.reason.startsWith("daily_cap") ? 429 : 409;
    return Response.json(
      { error: result.reason, message: OUTSIDE_CHECK_REFUSALS[result.reason] },
      { status },
    );
  }
  audit(
    db,
    {
      login: session.login,
      event: "outside_check_requested",
      detail: { productId, jobId: result.id, created: result.created },
    },
    now,
  );
  return Response.json({ jobId: result.id, created: result.created });
}
