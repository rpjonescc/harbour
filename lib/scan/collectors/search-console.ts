import { FetchError } from "../fetch-error";
import type { CollectContext, Collector, CollectorResult, Observation } from "../types";
import {
  fetchFailure,
  GSC_MAX_BYTES,
  GSC_TIMEOUT_MS,
  type GscAccess,
  gscAccess,
  httpFailure,
} from "./gsc-access";
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

type Query = { ctx: CollectContext; access: GscAccess };

async function fetchReport(query: Query, report: GscReport, window: ReportWindow) {
  const { ctx, access } = query;
  let response: Awaited<ReturnType<CollectContext["fetch"]>>;
  try {
    response = await ctx.fetch(reportUrl(access.property), {
      post: { json: reportRequest(report, window), bearer: access.token },
      maxBytes: GSC_MAX_BYTES,
      onOverflow: "error",
      accept: "application/json",
      signal: ctx.signal,
      ignoreRobots: true,
      timeoutMs: GSC_TIMEOUT_MS,
    });
  } catch (error) {
    if (ctx.signal.aborted || !(error instanceof FetchError)) throw error;
    throw fetchFailure(error);
  }
  if (response.status < 200 || response.status >= 300) {
    throw httpFailure(response.status, response.body, access);
  }
  return readReport(response.body).map(
    ([subject, value]): Observation => ({ kind: report.kind, subject, value }),
  );
}

async function collectWith(
  accessToken: AccessTokenSource,
  ctx: CollectContext,
): Promise<CollectorResult> {
  const found = await gscAccess(ctx, accessToken);
  if ("notConfigured" in found) return found.notConfigured;
  const { access } = found;
  const query = { ctx, access };
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
    warning: access.warning,
  };
  observations.push({ kind: "gsc_summary", subject: access.property, value: summary });
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
