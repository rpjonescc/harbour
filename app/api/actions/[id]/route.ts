import { z } from "zod";
import { parseActionId } from "@/lib/actions/action-id";
import { applyStatusChange } from "@/lib/actions/status-change";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { getProducts } from "@/lib/products/catalog";

const Body = z
  .object({
    from: z.enum(["suggested", "open", "in_progress", "done", "snoozed", "dismissed"]),
    to: z.enum(["open", "in_progress", "done", "snoozed", "dismissed"]),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

/** The owner moves an action to a new status (from the status their page showed). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const id = parseActionId((await params).id);
  if (id === null) return jsonError(400, "invalid_id");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const { from, ...change } = body.data;
  const now = new Date();
  const result = applyStatusChange(getDb(), {
    id,
    from,
    change,
    actor: "owner",
    login: session.login,
    productIds: getProducts().map((p) => p.id),
    today: isoDateIn(config.HARBOUR_TIMEZONE, now),
    now,
  });
  if (!result.ok) return jsonError(result.error === "not_found" ? 404 : 409, result.error);
  const { status, snoozedUntil } = result;
  return Response.json({ id, status, snoozedUntil });
}
