import { usdMicroToAudMicro } from "@/lib/costs/currency";
import { FetchError } from "../fetch-error";
import type { TregProblem } from "../treg-shapes";
import type { CollectContext } from "../types";
import { parseJson } from "./google-api";
import { ceilingHeaderValue, ceilingMicroUsd, type Endpoint } from "./treg-endpoints";

/** An AI answer takes about 30 s; the rest is quicker. */
export const TREG_TIMEOUT_MS = 90_000;
/** A call's answer is a few KiB; 1 MiB leaves room without trusting it. */
export const TREG_MAX_BYTES = 1024 * 1024;
/** A charge above US$1 for one call cannot be real (the ceiling stops at US$0.05). */
const MAX_PLAUSIBLE_COST_MICRO_USD = 1_000_000;

/** What one run of the collector shares: the key, the rate and what has been spent so far. */
export type TregRun = {
  ctx: CollectContext;
  /** Only ever placed in a request header: never in a message, a log line or a stored value. */
  apiKey: string;
  /** AUD per USD (HARBOUR_USD_TO_AUD). */
  rate: number;
  baseUrl: string;
  timeoutMs: number;
  /** Micro-USD charged so far this run (the estimate where Treg gave no usable figure). */
  spentMicroUsd: number;
};

/** What a call came to: its parsed answer, a failed check, or a reason to end the whole run. */
export type CallOutcome<Out> =
  | { kind: "ok"; value: Out }
  | { kind: "failed"; problem: TregProblem }
  | { kind: "stop"; why: "budget" | "balance" | "key" | "error" };

const failed = (problem: TregProblem): CallOutcome<never> => ({ kind: "failed", problem });

/** Records what a call cost: the ledger takes micro-AUD, the run's tally micro-USD. */
function settle(run: TregRun, microUsd: number): void {
  run.spentMicroUsd += microUsd;
  const amountMicroAud = usdMicroToAudMicro(microUsd, run.rate);
  run.ctx.cost.record({ provider: "treg", units: 1, amountMicroAud });
}

/** The charge Treg reports in micro-USD, or null when the header is missing or not a plain count. */
function reportedCost(headers: Record<string, string>): number | null {
  const raw = headers["x-treg-cost-micro"];
  if (raw === undefined || !/^\d{1,9}$/.test(raw)) return null;
  const micro = Number(raw);
  return micro <= MAX_PLAUSIBLE_COST_MICRO_USD ? micro : null;
}

/** Whether a 402 is the per-call ceiling refusal (nothing charged) rather than an empty balance. */
function isCeilingRefusal(body: string): boolean {
  const parsed = parseJson(body);
  if (typeof parsed !== "object" || parsed === null || !("detail" in parsed)) return false;
  const { detail } = parsed;
  return (
    typeof detail === "object" &&
    detail !== null &&
    "error" in detail &&
    detail.error === "route_max_cost"
  );
}

/** What a non-2xx answer means: one check lost, or a reason that would repeat for every call. */
function refusal(status: number, body: string): CallOutcome<never> {
  if (status === 401 || status === 403) return { kind: "stop", why: "key" };
  if (status === 402) {
    return isCeilingRefusal(body) ? failed("above_ceiling") : { kind: "stop", why: "balance" };
  }
  if (status === 429) return { kind: "stop", why: "error" };
  if (status === 404 || status === 410) return failed("retired");
  return failed(status >= 500 ? "server" : "rejected");
}

/** A failure to get any answer. A timeout or an oversized answer may still have been billed. */
function transportProblem(error: unknown): { problem: TregProblem; maybeBilled: boolean } {
  const kind = error instanceof FetchError ? error.kind : "network";
  if (kind === "timeout") return { problem: "timeout", maybeBilled: true };
  if (kind === "too_large") return { problem: "unreadable", maybeBilled: true };
  return { problem: "network", maybeBilled: false };
}

/**
 * One paid call: asks the budget, sends it with a price ceiling, records what it cost and reads
 * the answer. Never retries. A failure carries a fixed code: no text from Treg, the request or the
 * error (which may hold the key's header) reaches a message, log line or stored value.
 */
export async function callEndpoint<In, Out>(
  run: TregRun,
  endpoint: Endpoint<In, Out>,
  input: In,
): Promise<CallOutcome<Out>> {
  const { ctx } = run;
  const estimate = endpoint.estimateMicroUsd;
  // At least 1: the ledger refuses a free-looking price.
  if (!ctx.budget.allow(Math.max(1, usdMicroToAudMicro(estimate, run.rate)))) {
    return { kind: "stop", why: "budget" };
  }
  const headers = {
    "x-treg-token": run.apiKey,
    "x-treg-route-max-cost": ceilingHeaderValue(ceilingMicroUsd(estimate)),
  };
  let response: Awaited<ReturnType<CollectContext["fetch"]>>;
  try {
    response = await ctx.fetch(`${run.baseUrl}/call/${endpoint.id}`, {
      post: { json: endpoint.request(input), headers },
      maxBytes: TREG_MAX_BYTES,
      onOverflow: "error",
      accept: "application/json",
      signal: ctx.signal,
      ignoreRobots: true,
      timeoutMs: run.timeoutMs,
    });
  } catch (error) {
    if (ctx.signal.aborted) throw error;
    const { problem, maybeBilled } = transportProblem(error);
    if (maybeBilled) settle(run, estimate);
    return failed(problem);
  }
  const reported = reportedCost(response.headers);
  const ok = response.status >= 200 && response.status < 300;
  if (ok && reported === null) {
    ctx.log("A call's cost was missing or unreadable: its estimate was recorded");
    settle(run, estimate);
  } else if (reported !== null && (ok || reported > 0)) {
    settle(run, reported);
  }
  if (!ok) return refusal(response.status, response.body);
  const parsed = parseJson(response.body);
  const value = parsed === null ? null : endpoint.parse(parsed, input);
  return value === null ? failed("unreadable") : { kind: "ok", value };
}
