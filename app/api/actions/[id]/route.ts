import { z } from "zod";
import { parseActionId } from "@/lib/actions/action-id";
import { BOARD_COLUMNS } from "@/lib/actions/board-column";
import { MOVE_REFUSAL } from "@/lib/actions/move-refusal";
import { moveToColumn } from "@/lib/actions/move-to-column";
import { applyStatusChange } from "@/lib/actions/status-change";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { getProducts } from "@/lib/products/catalog";

const note = z.string().trim().max(500).optional();

const StatusBody = z
  .object({
    from: z.enum(["suggested", "open", "in_progress", "done", "snoozed", "dismissed"]),
    to: z.enum(["open", "in_progress", "done", "snoozed", "dismissed"]),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note,
  })
  .strict();

const column = z.enum(BOARD_COLUMNS);

/** A board move: from the column the page showed to another; keys differ from a status body. */
const MoveBody = z.object({ moveFrom: column, moveTo: column, note }).strict();

const Body = z.union([StatusBody, MoveBody]);

/**
 * The owner changes an action: a status change (from the status their page showed) or a board
 * move (from the column their page showed).
 */
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

  const productIds = getProducts().map((p) => p.id);
  const now = new Date();
  if ("moveTo" in body.data) {
    const { moveFrom, moveTo, note: moveNote } = body.data;
    const result = moveToColumn(getDb(), {
      id,
      from: moveFrom,
      to: moveTo,
      actor: "owner",
      note: moveNote,
      login: session.login,
      productIds,
      now,
    });
    if (result.ok) return Response.json({ id, column: moveTo });
    // Every refusal carries its sentence, a gone card too: "try again" would not help there.
    return Response.json(
      { error: result.reason, message: MOVE_REFUSAL[result.reason] },
      { status: result.reason === "not_found" ? 404 : 409 },
    );
  }

  const { from, ...change } = body.data;
  const result = applyStatusChange(getDb(), {
    id,
    from,
    change,
    actor: "owner",
    login: session.login,
    productIds,
    today: isoDateIn(config.HARBOUR_TIMEZONE, now),
    now,
  });
  if (!result.ok) return jsonError(result.error === "not_found" ? 404 : 409, result.error);
  const { status, snoozedUntil } = result;
  return Response.json({ id, status, snoozedUntil });
}
