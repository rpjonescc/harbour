import { FetchError } from "../fetch-error";
import type { CollectContext, Collector, CollectorResult } from "../types";
import { readGoogleError } from "./google-api";
import { readCoreWebVitals } from "./pagespeed-response";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
/** PSI runs Lighthouse before answering (15–40 s): a deliberate exception to the 15 s limit. */
const PSI_TIMEOUT_MS = 90_000;
/** With `fields` the answer is a few KiB; 1 MiB leaves room without trusting it. */
const PSI_MAX_BYTES = 1024 * 1024;

/**
 * Partial-response mask: only what readCoreWebVitals reads (a full result carries
 * screenshots and every audit, often several MiB). Keep it in step with pagespeed-response.ts.
 */
export const PSI_FIELDS =
  "loadingExperience/metrics,lighthouseResult(runtimeError,categories/performance/score," +
  "audits(largest-contentful-paint/numericValue,cumulative-layout-shift/numericValue," +
  "first-contentful-paint/numericValue,total-blocking-time/numericValue))";

/** Keyless requests have no quota at all (Google answers 429 with a quota limit of 0). */
const NOT_CONFIGURED =
  'PageSpeed Insights needs an API key: in Google Cloud, enable the "PageSpeed Insights API", ' +
  "create an API key restricted to that API, set HARBOUR_PAGESPEED_API_KEY in .env and " +
  "restart the worker.";

function requestUrl(productUrl: string, key: string): string {
  const params = new URLSearchParams({
    url: productUrl,
    strategy: "mobile",
    category: "performance",
    fields: PSI_FIELDS,
    key,
  });
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

function httpFailure(status: number, body: string, key: string): Error {
  const google = readGoogleError(body);
  const message = google?.message.replaceAll(key, "[redacted]");
  const detail = message ? `: ${message}` : ".";
  if (status === 429 || google?.quota) {
    const advice =
      "The API key's quota is used up: raise it in Google Cloud, or wait for the next weekly run.";
    return new Error(`PageSpeed Insights quota exceeded (HTTP ${status})${detail} ${advice}`);
  }
  return new Error(`PageSpeed Insights answered HTTP ${status}${detail}`);
}

async function collect(ctx: CollectContext): Promise<CollectorResult> {
  const subject = new URL(ctx.product.url).href;
  const key = ctx.config.HARBOUR_PAGESPEED_API_KEY;
  if (!key) return { status: "not_configured", reason: NOT_CONFIGURED };
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
    throw httpFailure(response.status, response.body, key);
  }
  const value = readCoreWebVitals(response.body);
  ctx.log(`performance ${value.performanceScore ?? "unknown"} (mobile)`);
  return { status: "ok", observations: [{ kind: "cwv", subject, value }] };
}

/** Core Web Vitals from Google PageSpeed Insights (mobile), at most once a week. */
export const pagespeed: Collector = { id: "pagespeed", cadence: "weekly", collect };
