import { z } from "zod";
import { audit } from "@/lib/audit";
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { addDays } from "@/lib/format/zoned-time";
import { DAILY_CAP_MESSAGE, enqueueContent } from "./limits";

/** Every action the Content page can request; later tasks add their own. */
export const ContentBody = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("make-digest") }),
]);
export type ContentBody = z.infer<typeof ContentBody>;

export type RequestContext = { db: Db; config: Config; login: string; now: Date };
export type RequestResult =
  | { ok: true; jobIds: number[] }
  | { ok: false; status: number; error: string; message?: string };

const refuse = (status: number, error: string, message?: string): RequestResult => ({
  ok: false,
  status,
  error,
  ...(message ? { message } : {}),
});

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

/** Applies one request from the Content page: enqueue a job (never write the brain) and audit it. */
export function requestContent(ctx: RequestContext, body: ContentBody): RequestResult {
  const blocked = contentPreconditions(ctx.config);
  if (blocked) return blocked;
  if (body.action === "make-digest") {
    if (!ctx.config.HARBOUR_SCREENPIPE_API_KEY) return refuse(409, "screenpipe_missing");
    const zone = ctx.config.HARBOUR_TIMEZONE;
    const day = addDays(isoDateIn(zone, ctx.now), -1);
    const queued = enqueueContent(ctx.db, {
      kind: "content-digest",
      params: { day },
      requestedBy: ctx.login,
      timeZone: zone,
      now: ctx.now,
      dailyRuns: ctx.config.HARBOUR_CONTENT_DAILY_RUNS,
    });
    if (!queued.ok) return limitRefusal(queued.reason);
    // A second click while the job waits returns the same job: one request, one audit row.
    if (queued.created) {
      audit(
        ctx.db,
        { login: ctx.login, event: "content_run_requested", detail: { kind: "content-digest" } },
        ctx.now,
      );
    }
    return { ok: true, jobIds: [queued.id] };
  }
  return refuse(400, "invalid_request");
}
