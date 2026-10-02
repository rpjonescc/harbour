import { FetchError } from "../fetch-error";
import type { CollectContext, Collector, CollectorResult, Observation } from "../types";
import { type GoogleError, isApiDisabled, readGoogleError, shorten } from "./google-api";
import { type GscCredentials, readGscCredentials } from "./gsc-credentials";
import {
  GSC_REPORTS,
  type GscReport,
  type ReportWindow,
  readReport,
  reportRequest,
  reportUrl,
  reportWindows,
} from "./gsc-report";
import { type AccessTokenSource, googleAccessToken } from "./gsc-token";

const TIMEOUT_MS = 30_000;
/** 250 rows is a few dozen KiB; 1 MiB leaves room without trusting it. */
const MAX_BYTES = 1024 * 1024;
const GUIDE = 'see "Connect Search Console" in README.md';

const NO_CREDENTIALS =
  "Set HARBOUR_GSC_CREDENTIALS in .env to the path of a Google credentials JSON file " +
  `(mode 600) and restart the worker: ${GUIDE}.`;
const MISSING_FILE =
  "HARBOUR_GSC_CREDENTIALS names a file that does not exist: save the Google credentials " +
  `JSON there with mode 600; ${GUIDE}.`;

const noProperty = (productId: string) =>
  `Add "searchConsoleProperty" to the "${productId}" product in harbour.config.json, e.g. ` +
  '"sc-domain:example.com" or "https://www.example.com/", and restart the worker.';

/** Whose access Search Console checks, for the "share the property" advice. */
function account(credentials: GscCredentials): string {
  return credentials.type === "service_account"
    ? credentials.clientEmail
    : "the Google account that authorised the OAuth client";
}

function accessFailure(status: number, google: GoogleError | null, property: string, who: string) {
  const said = google ? ` Google said: ${shorten(google.message)}` : "";
  if (isApiDisabled(google)) {
    return new Error(
      `Search Console API is not enabled (HTTP ${status}): enable the Google Search Console API ` +
        `in the credential's Google Cloud project.${said}`,
    );
  }
  return new Error(
    `Search Console refused access to ${property} (HTTP ${status}): check the property is ` +
      `shared with the credential's account (${who}).${said}`,
  );
}

function httpFailure(status: number, body: string, property: string, who: string): Error {
  const google = readGoogleError(body);
  if (status === 401 || status === 403) return accessFailure(status, google, property, who);
  const detail = google ? `: ${shorten(google.message)}` : ".";
  if (status === 429 || google?.quota) {
    return new Error(
      `Search Console quota exceeded (HTTP ${status})${detail} Wait for tomorrow's scan.`,
    );
  }
  return new Error(`Search Console answered HTTP ${status}${detail}`);
}

/** No `cause`: the FetchError's message has the request URL, and the token rode along. */
function fetchFailure(error: FetchError): Error {
  if (error.kind === "timeout") {
    return new Error(`Search Console did not answer within ${TIMEOUT_MS / 1000} s`);
  }
  return new Error(`Search Console request failed (${error.kind})`);
}

type Query = { ctx: CollectContext; property: string; token: string; who: string };

async function fetchReport(query: Query, report: GscReport, window: ReportWindow) {
  const { ctx, property, token, who } = query;
  let response: Awaited<ReturnType<CollectContext["fetch"]>>;
  try {
    response = await ctx.fetch(reportUrl(property), {
      post: { json: reportRequest(report, window), bearer: token },
      maxBytes: MAX_BYTES,
      onOverflow: "error",
      accept: "application/json",
      signal: ctx.signal,
      ignoreRobots: true,
      timeoutMs: TIMEOUT_MS,
    });
  } catch (error) {
    if (ctx.signal.aborted || !(error instanceof FetchError)) throw error;
    throw fetchFailure(error);
  }
  if (response.status < 200 || response.status >= 300) {
    throw httpFailure(response.status, response.body, property, who);
  }
  return readReport(response.body).map(
    ([subject, value]): Observation => ({ kind: report.kind, subject, value }),
  );
}

async function collectWith(
  accessToken: AccessTokenSource,
  ctx: CollectContext,
): Promise<CollectorResult> {
  const path = ctx.config.HARBOUR_GSC_CREDENTIALS;
  if (!path) return { status: "not_configured", reason: NO_CREDENTIALS };
  const property = ctx.product.searchConsoleProperty;
  if (!property) return { status: "not_configured", reason: noProperty(ctx.product.id) };
  const file = await readGscCredentials(path);
  if (file.state === "missing") return { status: "not_configured", reason: MISSING_FILE };
  if (file.warning) ctx.log(file.warning);
  const token = await accessToken(file.credentials, ctx.signal);
  const query = { ctx, property, token, who: account(file.credentials) };
  const windows = reportWindows(ctx.now);
  const observations: Observation[] = [];
  // One at a time: four small requests, and the shared limiter spaces them anyway.
  for (const report of GSC_REPORTS) {
    observations.push(...(await fetchReport(query, report, windows[report.period])));
  }
  const count = (kind: string) => observations.filter((o) => o.kind === kind).length;
  const [days, queries, pages] = [count("gsc_daily"), count("gsc_query"), count("gsc_page")];
  const priorDays = count("gsc_prior_daily");
  const { current, prior } = windows;
  ctx.log(
    `${days} days, ${queries} queries, ${pages} pages (${current.startDate} to ` +
      `${current.endDate}); ${priorDays} days in the 28 before`,
  );
  const summary = {
    ...current,
    days,
    queries,
    pages,
    priorStartDate: prior.startDate,
    priorEndDate: prior.endDate,
    priorDays,
    warning: file.warning,
  };
  observations.push({ kind: "gsc_summary", subject: property, value: summary });
  return { status: "ok", observations };
}

/** Builds the collector around a token source (tests inject a fake one). */
export function createSearchConsole(deps: { accessToken: AccessTokenSource }): Collector {
  return {
    id: "search-console",
    cadence: "daily",
    paid: false,
    collect: (ctx) => collectWith(deps.accessToken, ctx),
  };
}

/** Google Search Console: 28 days of clicks and impressions, top queries and pages. */
export const searchConsole: Collector = createSearchConsole({ accessToken: googleAccessToken });
