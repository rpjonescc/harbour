import { z } from "zod";
import { audit } from "@/lib/audit";
import type { Config } from "@/lib/config";
import { voiceMissingMessage } from "@/lib/explain/content";
import { isoDateIn } from "@/lib/format/date";
import { addDays } from "@/lib/format/iso-day";
import { DecisionBody } from "./decision";
import { ideaIdSchema, productForIdea, productIdSchema } from "./ids";
import { type ContentKind, DAILY_CAP_MESSAGE, enqueueContent } from "./limits";
import { activeStepId, latestFailedStep } from "./read/chain-status";
import {
  countWaitingIdeas,
  MAX_WAITING_IDEAS,
  readAllIdeas,
  TooManyIdeaFilesError,
} from "./read/ideas";
import { readVoice } from "./read/voice";
import { requestDecision } from "./request-decision";
import { PostizBody, requestPostiz } from "./request-postiz";
import { BRAIN_UNREADABLE, type RequestContext, type RequestResult, refuse } from "./request-types";

const RunBody = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("make-digest") }),
  z.strictObject({ action: z.literal("find-ideas"), productId: productIdSchema }),
  z.strictObject({ action: z.literal("write-this"), ideaId: ideaIdSchema }),
  z.strictObject({ action: z.literal("try-again"), ideaId: ideaIdSchema }),
]);
/** Every action the Content page can request: running a step, or deciding about a piece or idea. */
export const ContentBody = z.union([RunBody, DecisionBody, PostizBody]);
export type ContentBody = z.infer<typeof ContentBody>;

/** Checks that every content request needs: the machine is on and the Claude token is set. */
export function contentPreconditions(config: Config): RequestResult | null {
  if (config.HARBOUR_CONTENT !== "on") return refuse(409, "content_off");
  if (!config.HARBOUR_CLAUDE_OAUTH_TOKEN) return refuse(409, "token_missing");
  return null;
}

function limitRefusal(reason: "daily_cap" | "rate_limited"): RequestResult {
  return reason === "daily_cap"
    ? refuse(429, "daily_cap", DAILY_CAP_MESSAGE)
    : refuse(429, "rate_limited");
}

type Kind = ContentKind;

/** Queues one job and audits it; a second click while it waits returns the same job, audited once. */
function enqueueAndAudit(
  ctx: RequestContext,
  kind: Kind,
  params: Record<string, string>,
  detail: Record<string, string>,
): RequestResult {
  const queued = enqueueContent(ctx.db, {
    kind,
    params,
    requestedBy: ctx.login,
    timeZone: ctx.config.HARBOUR_TIMEZONE,
    now: ctx.now,
    dailyRuns: ctx.config.HARBOUR_CONTENT_DAILY_RUNS,
  });
  if (!queued.ok) return limitRefusal(queued.reason);
  if (queued.created) {
    audit(
      ctx.db,
      { login: ctx.login, event: "content_run_requested", detail: { kind, ...detail } },
      ctx.now,
    );
  }
  return { ok: true, jobIds: [queued.id] };
}

function findIdeas(ctx: RequestContext, productId: string): RequestResult {
  const product = ctx.products.find((p) => p.id === productId);
  if (!product) return refuse(404, "not_found");
  try {
    // An unusable profile is not refused here: the job fails with the reason and the page shows it.
    if (readVoice(ctx.root, productId).state === "missing") {
      return refuse(409, "voice_missing", voiceMissingMessage(product.name));
    }
    if (countWaitingIdeas(ctx.root, productId) >= MAX_WAITING_IDEAS) {
      return refuse(409, "backlog", `${MAX_WAITING_IDEAS} ideas are waiting; skipped`);
    }
  } catch (error) {
    if (error instanceof TooManyIdeaFilesError) return refuse(409, "too_many_ideas", error.message);
    return refuse(409, "brain_unreadable", BRAIN_UNREADABLE);
  }
  return enqueueAndAudit(ctx, "content-ideas", { productId }, { productId });
}

function writeThis(ctx: RequestContext, ideaId: string): RequestResult {
  const product = productForIdea(ctx.products, ideaId);
  if (!product) return refuse(404, "not_found");
  try {
    const idea = readAllIdeas(ctx.root, product.id).ideas.find((i) => i.id === ideaId);
    if (!idea) return refuse(404, "not_found");
    if (idea.front.state !== "idea") return refuse(409, "not_an_idea");
    if (readVoice(ctx.root, product.id).state === "missing") {
      return refuse(409, "voice_missing", voiceMissingMessage(product.name));
    }
  } catch (error) {
    if (error instanceof TooManyIdeaFilesError) return refuse(409, "too_many_ideas", error.message);
    return refuse(409, "brain_unreadable", BRAIN_UNREADABLE);
  }
  return enqueueAndAudit(ctx, "content-draft", { ideaId }, { productId: product.id, ideaId });
}

const TRY_AGAIN_REFUSALS = {
  missing: "Harbour couldn't find that idea. Refresh the page and try again.",
  finished: "That idea is already finished, so there is nothing to try again.",
  discarded: "That idea was discarded, so Harbour won't write it. Refresh the page.",
  brain_unreadable: BRAIN_UNREADABLE,
} as const;

/** Whether the idea file exists and can still be worked on; reads only. */
function ideaIsOpen(
  ctx: RequestContext,
  productId: string,
  ideaId: string,
): "open" | keyof typeof TRY_AGAIN_REFUSALS {
  try {
    const idea = readAllIdeas(ctx.root, productId).ideas.find((i) => i.id === ideaId);
    if (!idea) return "missing";
    if (idea.front.state === "discarded") return "discarded";
    return idea.front.state === "drafted" ? "finished" : "open";
  } catch {
    return "brain_unreadable";
  }
}

/** Re-queues the idea's newest failed step with its own kind and params (Decision 4). */
function tryAgain(ctx: RequestContext, ideaId: string): RequestResult {
  const product = productForIdea(ctx.products, ideaId);
  if (!product) return refuse(404, "not_found");
  const open = ideaIsOpen(ctx, product.id, ideaId);
  if (open !== "open") {
    return refuse(open === "missing" ? 404 : 409, open, TRY_AGAIN_REFUSALS[open]);
  }
  const step = latestFailedStep(ctx.db, ideaId);
  if (!step) {
    // A double click: the retry from the first click is under way, which is what was asked for.
    const active = activeStepId(ctx.db, ideaId);
    return active === null ? refuse(409, "nothing_to_retry") : { ok: true, jobIds: [active] };
  }
  return enqueueAndAudit(ctx, step.kind, step.params, { productId: product.id, ideaId });
}

/** Applies one request from the Content page: enqueue a job (never write the brain) and audit it. */
export function requestContent(ctx: RequestContext, body: ContentBody): RequestResult {
  if (body.action === "approve" || body.action === "edit" || body.action === "discard") {
    // A decision runs no model, so it needs only the machine on, not the Claude token.
    return ctx.config.HARBOUR_CONTENT === "on"
      ? requestDecision(ctx, body)
      : refuse(409, "content_off");
  }
  if (body.action === "send-to-postiz") {
    // Nor does a Postiz send: it needs the machine on and Postiz set up.
    return ctx.config.HARBOUR_CONTENT === "on"
      ? requestPostiz(ctx, body)
      : refuse(409, "content_off");
  }
  const blocked = contentPreconditions(ctx.config);
  if (blocked) return blocked;
  if (body.action === "make-digest") {
    if (!ctx.config.HARBOUR_SCREENPIPE_API_KEY) return refuse(409, "screenpipe_missing");
    const day = addDays(isoDateIn(ctx.config.HARBOUR_TIMEZONE, ctx.now), -1);
    return enqueueAndAudit(ctx, "content-digest", { day }, {});
  }
  if (body.action === "find-ideas") return findIdeas(ctx, body.productId);
  if (body.action === "write-this") return writeThis(ctx, body.ideaId);
  if (body.action === "try-again") return tryAgain(ctx, body.ideaId);
  return refuse(400, "invalid_request");
}
