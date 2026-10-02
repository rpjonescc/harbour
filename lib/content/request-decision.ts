import { and, count, eq, inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { jobs } from "@/lib/db/schema";
import { enqueueJobIn, findActiveJob } from "@/lib/jobs/queue";
import { approveProblem, type DecisionBody, MAX_EDIT_CHARS } from "./decision";
import { productForIdea, splitPieceId } from "./ids";
import { readAllIdeas, TooManyIdeaFilesError } from "./read/ideas";
import { type ReadPiece, readPieces } from "./read/pieces";
import { BRAIN_UNREADABLE, type RequestContext, type RequestResult, refuse } from "./request-types";
import { revisionMatches, transition } from "./state";

const STALE = "This piece changed since you opened it. Reload and try again.";
const BUSY = "Harbour is still saving your earlier decisions. Give it a moment, then try again.";
/** Decisions waiting at once; the owner is one person, so this is generous and still bounded. */
export const MAX_PENDING_DECISIONS = 20;

type Piece = ReadPiece;

/** A folder or file that could not be read: said plainly, and nothing is queued. */
class Unreadable extends Error {}

function look<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof TooManyIdeaFilesError) throw error;
    throw new Unreadable();
  }
}

function approveRefusal(
  piece: Piece,
  body: Extract<DecisionBody, { action: "approve" }>,
): RequestResult | null {
  const problem = approveProblem(
    {
      state: piece.front.state,
      flags: piece.front.flags,
      hasContent: piece.content !== null,
      needsYou: piece.front.needsYou,
    },
    { checkedFlags: body.checkedFlags, confirmOpen: body.confirmOpen },
  );
  if (problem === null) return null;
  if (problem.startsWith("Tick every flag")) return refuse(400, "flags_unchecked", problem);
  if (problem.startsWith("Approve anyway?")) return refuse(400, "confirm_needed", problem);
  return refuse(409, "not_approvable", problem);
}

function editRefusal(
  piece: Piece,
  body: Extract<DecisionBody, { action: "edit" }>,
): RequestResult | null {
  if (transition(piece.front.state, "edit") === null || piece.content === null) {
    return refuse(409, "not_editable", "This piece can't be edited now.");
  }
  return body.body.length > MAX_EDIT_CHARS[piece.platform]
    ? refuse(400, "too_long", "That is longer than this platform allows.")
    : null;
}

/**
 * Queues the decision job and audits it once. An identical job already waiting is returned
 * first (a double click is not a second decision); the bound on waiting decisions comes after.
 */
function queue(
  ctx: RequestContext,
  params: Record<string, string>,
  detail: Record<string, unknown>,
): RequestResult {
  const queued = ctx.db.transaction(
    (tx) => {
      const existing = findActiveJob(tx, "content-decision", params);
      if (existing !== null) return { id: existing, created: false };
      const waiting = tx
        .select({ n: count() })
        .from(jobs)
        .where(and(eq(jobs.kind, "content-decision"), inArray(jobs.status, ["queued", "running"])))
        .get();
      if ((waiting?.n ?? 0) >= MAX_PENDING_DECISIONS) return null;
      return enqueueJobIn(tx, "content-decision", params, ctx.login, ctx.now);
    },
    { behavior: "immediate" },
  );
  if (queued === null) return refuse(429, "busy", BUSY);
  if (queued.created)
    audit(ctx.db, { login: ctx.login, event: "content_decided", detail }, ctx.now);
  return { ok: true, jobIds: [queued.id] };
}

function decideIdea(ctx: RequestContext, ideaId: string): RequestResult {
  const product = productForIdea(ctx.products, ideaId);
  const idea =
    product && look(() => readAllIdeas(ctx.root, product.id).ideas.find((i) => i.id === ideaId));
  if (!idea) return refuse(404, "not_found");
  const open = look(() => readPieces(ctx.root, ideaId).pieces).some(
    (p) => p.front.state !== "discarded",
  );
  if (idea.front.state === "discarded" && !open) {
    return refuse(409, "already_discarded", "That idea is already discarded.");
  }
  return queue(
    ctx,
    { action: "discard", ideaId },
    { action: "discard", pieceId: null, fromState: idea.front.state, flagsChecked: [] },
  );
}

function decidePiece(
  ctx: RequestContext,
  body: Exclude<DecisionBody, { ideaId: string }>,
): RequestResult {
  const target = splitPieceId(body.pieceId);
  const product = target && productForIdea(ctx.products, target.ideaId);
  const piece = product
    ? look(() => readPieces(ctx.root, target.ideaId).pieces).find(
        (p) => p.platform === target.platform,
      )
    : undefined;
  if (!piece) return refuse(404, "not_found");
  if (!revisionMatches(piece.front.revision, body.revision)) return refuse(409, "stale", STALE);
  if (body.action === "discard" && transition(piece.front.state, "discard") === null) {
    return refuse(409, "already_discarded", "That piece is already discarded.");
  }
  const refusal =
    body.action === "approve"
      ? approveRefusal(piece, body)
      : body.action === "edit"
        ? editRefusal(piece, body)
        : null;
  if (refusal) return refusal;
  const flagsChecked = body.action === "approve" ? body.checkedFlags : [];
  const params: Record<string, string> = {
    action: body.action,
    pieceId: body.pieceId,
    revision: String(body.revision),
  };
  if (body.action === "approve") {
    params.flags = flagsChecked.join(",");
    if (body.confirmOpen) params.confirm = "1";
  }
  // The edited text rides in the job's params (the owner's own words), never in the audit detail.
  if (body.action === "edit") params.body = body.body;
  return queue(ctx, params, {
    action: body.action,
    pieceId: body.pieceId,
    fromState: piece.front.state,
    flagsChecked,
  });
}

/** Validates a decision against the files as the web process reads them, audits it, and enqueues the job. */
export function requestDecision(ctx: RequestContext, body: DecisionBody): RequestResult {
  try {
    return "ideaId" in body ? decideIdea(ctx, body.ideaId) : decidePiece(ctx, body);
  } catch (error) {
    if (error instanceof TooManyIdeaFilesError) return refuse(409, "too_many_ideas", error.message);
    if (error instanceof Unreadable) return refuse(409, "brain_unreadable", BRAIN_UNREADABLE);
    throw error;
  }
}
