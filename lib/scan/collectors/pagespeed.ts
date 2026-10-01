import { FetchError } from "../fetch-error";
import type { CollectContext, Collector, CollectorResult } from "../types";
import { readCoreWebVitals, readGoogleError } from "./pagespeed-response";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
/** PSI runs Lighthouse before answering (15–40 s): a deliberate exception to the 15 s limit. */
const PSI_TIMEOUT_MS = 90_000;
/** Full Lighthouse results include screenshots; a few MiB is normal. */
const PSI_MAX_BYTES = 10 * 1024 * 1024;

function requestUrl(productUrl: string, key: string | undefined): string {
  const params = new URLSearchParams({
    url: productUrl,
    strategy: "mobile",
    category: "performance",
  });
  if (key) params.set("key", key);
  return `${ENDPOINT}?${params}`;
}

/**
 * Why the request failed, without the request URL: it carries the API key. No `cause` either,
 * since the FetchError's own message has the URL.
 */
function fetchFailure(error: FetchError): Error {
  if (error.kind === "timeout") {
    return new Error(`PageSpeed Insights did not answer within ${PSI_TIMEOUT_MS / 1000} s`);
  }
  return new Error(`PageSpeed Insights request failed (${error.kind})`);
}

function httpFailure(status: number, body: string, redact: (text: string) => string): Error {
  const google = readGoogleError(body);
  const detail = google ? `: ${redact(google.message)}` : "";
  if (status === 429 || google?.quota) {
    return new Error(
      `PageSpeed Insights quota exceeded (HTTP ${status})${detail || "."} ` +
        "Set HARBOUR_PAGESPEED_API_KEY " +
        "for a higher quota, or wait for the next weekly run.",
    );
  }
  return new Error(`PageSpeed Insights answered HTTP ${status}${detail}`);
}

async function collect(ctx: CollectContext): Promise<CollectorResult> {
  const subject = new URL(ctx.product.url).href;
  const key = ctx.config.HARBOUR_PAGESPEED_API_KEY;
  const redact = (text: string) => (key ? text.replaceAll(key, "[redacted]") : text);
  let response: Awaited<ReturnType<CollectContext["fetch"]>>;
  try {
    response = await ctx.fetch(requestUrl(subject, key), {
      maxBytes: PSI_MAX_BYTES,
      onOverflow: "error",
      accept: "application/json",
      signal: ctx.signal,
      ignoreRobots: true,
      timeoutMs: PSI_TIMEOUT_MS,
    });
  } catch (error) {
    if (ctx.signal.aborted || !(error instanceof FetchError)) throw error;
    throw fetchFailure(error);
  }
  if (response.status < 200 || response.status >= 300) {
    throw httpFailure(response.status, response.body, redact);
  }
  const value = readCoreWebVitals(response.body);
  ctx.log(`performance ${value.performanceScore ?? "unknown"} (mobile)`);
  return { status: "ok", observations: [{ kind: "cwv", subject, value }] };
}

/** Core Web Vitals from Google PageSpeed Insights (mobile), at most once a week. */
export const pagespeed: Collector = { id: "pagespeed", cadence: "weekly", collect };
