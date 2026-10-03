import { TREG_REASONS } from "@/lib/explain/treg";
import { getTracking } from "@/lib/products/catalog";
import type { ProductTracking } from "@/lib/products/config";
import type { TregSummary } from "../treg-shapes";
import type { CollectContext, Collector, CollectorResult } from "../types";
import { type CheckInput, runChecks, type Tally } from "./treg-checks";
import { TREG_TIMEOUT_MS, type TregRun } from "./treg-client";
import { ENDPOINT_IDS, TREG_BASE_URL } from "./treg-endpoints";
import { productDomain } from "./treg-match";

/** The run ends here (the worker's own limit for this collector is 10 minutes). */
const MAX_RUN_MS = 8 * 60_000;

export type TregDeps = {
  /** What the owner chose to track for a product; null when nothing. */
  tracking: (productId: string) => ProductTracking | null;
  /** Treg's address; tests point it at a local fake server. */
  baseUrl: string;
  timeoutMs: number;
  /** Milliseconds now, for the run's own time limit. */
  clock: () => number;
};

const summaryOf = (tally: Tally, spentMicroUsd: number): TregSummary => ({
  attempted: tally.ok + tally.failed,
  ok: tally.ok,
  failed: tally.failed,
  spentMicroUsd,
  stoppedBy: tally.stoppedBy,
  problems: tally.problems,
});

/** What a run with no answered check ends as: a skip for the budget, else a fixed failure. */
function nothingAnswered(tally: Tally): CollectorResult {
  const { stoppedBy } = tally;
  if (stoppedBy === "budget" && tally.failed === 0) {
    return { status: "skipped", reason: TREG_REASONS.budget };
  }
  if (stoppedBy === "key") throw new Error(TREG_REASONS.key);
  if (stoppedBy === "balance") throw new Error(TREG_REASONS.balance);
  if (stoppedBy === "error" && tally.failed === 0) throw new Error(TREG_REASONS.rateLimited);
  throw new Error(TREG_REASONS.nothingAnswered);
}

async function collectWith(deps: TregDeps, ctx: CollectContext): Promise<CollectorResult> {
  const tracking = deps.tracking(ctx.product.id);
  if (!tracking || tracking.queries.length + tracking.questions.length === 0) {
    return { status: "not_configured", reason: TREG_REASONS.noSearches };
  }
  const apiKey = ctx.config.HARBOUR_TREG_API_KEY;
  if (!apiKey) return { status: "not_configured", reason: TREG_REASONS.noKey };

  const domain = productDomain(ctx.product.url);
  const run: TregRun = {
    ctx,
    apiKey,
    rate: ctx.config.HARBOUR_USD_TO_AUD,
    baseUrl: deps.baseUrl,
    timeoutMs: deps.timeoutMs,
    spentMicroUsd: 0,
  };
  const input: CheckInput = { name: ctx.product.name, domain, tracking };
  ctx.log(`Asking Treg: ${ENDPOINT_IDS.join(", ")}`);
  const tally = await runChecks(run, input, {
    clock: deps.clock,
    deadline: deps.clock() + MAX_RUN_MS,
  });
  const { ok, failed, stoppedBy } = tally;
  ctx.log(`${ok} of ${ok + failed} outside-view checks answered; the run ended: ${stoppedBy}`);
  if (ok === 0) return nothingAnswered(tally);
  const summary = summaryOf(tally, run.spentMicroUsd);
  const observations = [
    ...tally.observations,
    { kind: "treg_summary", subject: domain, value: summary },
  ];
  return { status: "ok", observations };
}

/** Builds the collector around its address, timeout and clock (tests inject fakes). */
export function createTreg(deps: TregDeps): Collector {
  return {
    id: "treg",
    cadence: "weekly",
    paid: true,
    collect: (ctx) => collectWith(deps, ctx),
  };
}

/**
 * The outside view, once a week: links to the site, where it ranks for the chosen searches and
 * whether ChatGPT names or cites it, through Treg. Paid, capped and checked against the budget.
 */
export const treg: Collector = createTreg({
  tracking: getTracking,
  baseUrl: TREG_BASE_URL,
  timeoutMs: TREG_TIMEOUT_MS,
  clock: Date.now,
});
