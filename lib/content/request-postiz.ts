import { z } from "zod";
import { audit } from "@/lib/audit";
import { POSTIZ_REFUSALS, resendQuestion } from "@/lib/explain/postiz";
import { formatDateTime } from "@/lib/format/date";
import { enqueueJobIn, findActiveJob } from "@/lib/jobs/queue";
import { PLATFORM_NAMES, pieceIdSchema, productForIdea, splitPieceId } from "./ids";
import { isPostizPlatform, postizConfigured } from "./postiz/channels";
import { SENDS_PER_HOUR, sendsInLastHour, sendsWaiting } from "./postiz/limits";
import { readPieces } from "./read/pieces";
import { BRAIN_UNREADABLE, type RequestContext, type RequestResult, refuse } from "./request-types";

/** "Send to Postiz as a draft" on an approved piece; `resend` is the answer to "Send it again?". */
export const PostizBody = z.strictObject({
  action: z.literal("send-to-postiz"),
  pieceId: pieceIdSchema,
  revision: z.number().int().min(1).max(100_000),
  resend: z.boolean().default(false),
});
export type PostizBody = z.infer<typeof PostizBody>;

function check(ctx: RequestContext, body: PostizBody): RequestResult | null {
  if (!postizConfigured(ctx.config)) return refuse(409, "postiz_off", POSTIZ_REFUSALS.notConnected);
  const target = splitPieceId(body.pieceId);
  const product = target && productForIdea(ctx.products, target.ideaId);
  let piece: ReturnType<typeof readPieces>["pieces"][number] | undefined;
  try {
    piece = product
      ? readPieces(ctx.root, target.ideaId).pieces.find((p) => p.platform === target.platform)
      : undefined;
  } catch {
    return refuse(409, "brain_unreadable", BRAIN_UNREADABLE);
  }
  if (!target || !piece) return refuse(404, "not_found", POSTIZ_REFUSALS.notFound);
  if (!isPostizPlatform(target.platform)) {
    return refuse(409, "not_supported", POSTIZ_REFUSALS.notSupported);
  }
  if (piece.front.revision !== body.revision) return refuse(409, "stale", POSTIZ_REFUSALS.stale);
  if (piece.front.state !== "approved" || piece.content === null) {
    return refuse(409, "not_approved", POSTIZ_REFUSALS.notApproved);
  }
  if (!ctx.postizChannels?.[target.platform]) {
    return refuse(409, "no_channel", POSTIZ_REFUSALS.noChannel(PLATFORM_NAMES[target.platform]));
  }
  const sent = piece.front.postiz;
  if (sent && !body.resend) {
    const when = formatDateTime(
      new Date(sent.sentAt),
      ctx.config.HARBOUR_TIMEZONE,
      ctx.config.HARBOUR_LOCALE,
    );
    return refuse(409, "confirm_resend", resendQuestion(when));
  }
  return null;
}

/**
 * Validates a send against the piece as the web process reads it, then queues one `content-postiz`
 * job and audits it. The web process never calls Postiz. One send waits at a time, and at most
 * five start in any hour; a double click returns the job already waiting.
 */
export function requestPostiz(ctx: RequestContext, body: PostizBody): RequestResult {
  const refused = check(ctx, body);
  if (refused) return refused;
  const params: Record<string, string> = {
    pieceId: body.pieceId,
    revision: String(body.revision),
    ...(body.resend ? { resend: "1" } : {}),
  };
  const queued = ctx.db.transaction(
    (tx) => {
      const existing = findActiveJob(tx, "content-postiz", params);
      if (existing !== null) return { id: existing, created: false };
      if (sendsWaiting(tx) > 0) return "busy" as const;
      if (sendsInLastHour(tx, ctx.now) >= SENDS_PER_HOUR) return "rate" as const;
      return enqueueJobIn(tx, "content-postiz", params, ctx.login, ctx.now);
    },
    { behavior: "immediate" },
  );
  if (queued === "busy") return refuse(429, "postiz_busy", POSTIZ_REFUSALS.busy);
  if (queued === "rate") return refuse(429, "rate_limited", POSTIZ_REFUSALS.rate);
  if (queued.created) {
    const detail = { kind: "content-postiz", pieceId: body.pieceId, resend: body.resend };
    audit(ctx.db, { login: ctx.login, event: "content_run_requested", detail }, ctx.now);
  }
  return { ok: true, jobIds: [queued.id] };
}
