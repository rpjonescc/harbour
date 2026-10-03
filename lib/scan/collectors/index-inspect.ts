import { FetchError } from "../fetch-error";
import type { CollectContext } from "../types";
import {
  GSC_MAX_BYTES,
  GSC_TIMEOUT_MS,
  type GscAccess,
  httpFailure,
  isQuotaFailure,
} from "./gsc-access";
import { type IndexStatus, readInspection } from "./index-state";

const ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

/** One inspection: Google's answer, a page left unchecked, or the day's quota used up. */
export type Inspected =
  | { outcome: "checked"; status: IndexStatus }
  | { outcome: "unchecked" }
  | { outcome: "quota" };

/**
 * Asks URL Inspection about one page. A 401/403 throws the access message (every page would fail
 * alike); quota ends the run; anything else wrong with this one page leaves it unchecked. No
 * `cause` and no response text reaches an error, so the token cannot leak.
 */
export async function inspectUrl(
  ctx: CollectContext,
  access: GscAccess,
  url: string,
  checkedAt: string,
): Promise<Inspected> {
  let response: Awaited<ReturnType<CollectContext["fetch"]>>;
  try {
    response = await ctx.fetch(ENDPOINT, {
      post: { json: { inspectionUrl: url, siteUrl: access.property }, bearer: access.token },
      maxBytes: GSC_MAX_BYTES,
      onOverflow: "error",
      accept: "application/json",
      signal: ctx.signal,
      ignoreRobots: true,
      timeoutMs: GSC_TIMEOUT_MS,
    });
  } catch (error) {
    if (ctx.signal.aborted || !(error instanceof FetchError)) throw error;
    return { outcome: "unchecked" };
  }
  if (response.status === 401 || response.status === 403) {
    throw httpFailure(response.status, response.body, access);
  }
  if (isQuotaFailure(response.status, response.body)) return { outcome: "quota" };
  if (response.status < 200 || response.status >= 300) return { outcome: "unchecked" };
  const status = readInspection(response.body, checkedAt);
  return status ? { outcome: "checked", status } : { outcome: "unchecked" };
}
