import { z } from "zod";
import { approveAllProposed, decideProposal, editProposal } from "@/lib/agents/proposals";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { getProducts } from "@/lib/products/catalog";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "reject"]), proposalId: z.number().int() }),
  z.object({
    action: z.literal("edit"),
    proposalId: z.number().int(),
    value: z.record(z.string(), z.string()),
  }),
  z.object({
    action: z.literal("approve-all"),
    type: z.enum(["keyword", "question", "competitor"]),
  }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const productId = (await params).id;
  if (!getProducts().some((p) => p.id === productId)) return jsonError(404, "not_found");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  const record = (detail: Record<string, unknown>) =>
    audit(db, {
      login: session.login,
      event: "proposal_decided",
      detail: { productId, ...detail },
    });
  const data = body.data;
  if (data.action === "approve-all") {
    const count = approveAllProposed(db, productId, data.type);
    record({ action: data.action, type: data.type, count });
    return Response.json({ ok: true, count });
  }
  if (data.action === "edit") {
    const result = editProposal(db, productId, data.proposalId, data.value);
    if (!result.ok) {
      return result.error === "not_found"
        ? jsonError(404, "not_found")
        : Response.json({ error: "invalid_edit", message: result.error }, { status: 400 });
    }
    record({ action: data.action, proposalId: data.proposalId });
    return Response.json({ ok: true });
  }
  const status = data.action === "approve" ? "approved" : "rejected";
  if (!decideProposal(db, productId, data.proposalId, status)) return jsonError(404, "not_found");
  record({ action: data.action, proposalId: data.proposalId });
  return Response.json({ ok: true });
}
