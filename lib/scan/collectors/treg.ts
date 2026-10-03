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
  /** Treg's address; the end-to-end tests' worker points it at a fake server. */
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
function nothingAnswered(tally: Tally, spentMicroUsd: number): CollectorResult {
  const { stoppedBy } = tally;
  if (stoppedBy === "budget" && tally.failed === 0) {
    return { status: "skipped", reason: TREG_REASONS.budget };
  }
  if (stoppedBy === "key") throw new Error(TREG_REASONS.key);
  if (stoppedBy === "balance") throw new Error(TREG_REASONS.balance);
  if (stoppedBy === "error" && tally.failed === 0) throw new Error(TREG_REASONS.rateLimited);
  // Calls that may have been billed come to nothing: the next scans wait (see `backoff`).
  throw new Error(
    spentMicroUsd > 0 ? TREG_REASONS.nothingAnsweredBilled : TREG_REASONS.nothingAnswered,
  );
}

type Halt = { why: "key" | "balance"; until: number };
// A refused key or an empty balance repeats for every product, so it ends them all: a key until
// the worker restarts (after the owner fixes it), a balance until the next scan day (it may be topped up).
const BALANCE_HALT_MS = 24 * 60 * 60_000;
const haltUntil = (why: "key" | "balance", now: number) =>
  why === "key" ? Number.POSITIVE_INFINITY : now + BALANCE_HALT_MS;
/** Header values: visible ASCII, no spaces. Anything else could never be sent. */
const USABLE_KEY = /^[!-~]{1,200}$/;

/** The run that found the problem says what it is; later runs only say Treg was paused. */
function stopped(why: "key" | "balance"): never {
  throw new Error(why === "key" ? TREG_REASONS.key : TREG_REASONS.balance);
}

async function collectWith(
  deps: TregDeps,
  ctx: CollectContext,
  state: { halted: Halt | null },
): Promise<CollectorResult> {
  const tracking = deps.tracking(ctx.product.id);
  if (!tracking || tracking.queries.length + tracking.questions.length === 0) {
    return { status: "not_configured", reason: TREG_REASONS.noSearches };
  }
  const apiKey = ctx.config.HARBOUR_TREG_API_KEY;
  if (!apiKey) return { status: "not_configured", reason: TREG_REASONS.noKey };

  if (!USABLE_KEY.test(apiKey)) {
    state.halted = { why: "key", until: haltUntil("key", deps.clock()) };
    return stopped("key");
  }
  // A manual check ignores a balance halt (the owner may have topped up) but not a refused key.
  const halted = state.halted && deps.clock() < state.halted.until ? state.halted : null;
  if (halted && !(ctx.manual && halted.why === "balance")) {
    throw new Error(halted.why === "key" ? TREG_REASONS.pausedKey : TREG_REASONS.pausedBalance);
  }

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
  if (stoppedBy === "key" || stoppedBy === "balance") {
    state.halted = { why: stoppedBy, until: haltUntil(stoppedBy, deps.clock()) };
  } else if (ok > 0 && state.halted?.why === "balance") {
    // A manual check got an answer after a top-up: the balance halt is over.
    state.halted = null;
  }
  ctx.log(`${ok} of ${ok + failed} outside-view checks answered; the run ended: ${stoppedBy}`);
  if (ok === 0) return nothingAnswered(tally, run.spentMicroUsd);
  const summary = summaryOf(tally, run.spentMicroUsd);
  const observations = [
    ...tally.observations,
    { kind: "treg_summary", subject: domain, value: summary },
  ];
  return { status: "ok", observations };
}

/** Builds the collector around its address, timeout and clock (tests inject fakes). */
export function createTreg(deps: TregDeps): Collector {
  // The collector lives as long as the worker, so this is how one product's refusal reaches the
  // others; a restart (after fixing the key) clears it.
  const state: { halted: Halt | null } = { halted: null };
  return {
    id: "treg",
    cadence: "weekly",
    paid: true,
    backoff: {
      error: TREG_REASONS.nothingAnsweredBilled,
      days: 2,
      reason: TREG_REASONS.backingOff,
    },
    collect: (ctx) => collectWith(deps, ctx, state),
  };
}

/** The collector as the worker runs it, at `baseUrl` (always Treg's own, except in the e2e worker). */
export function createDefaultTreg(baseUrl: string): Collector {
  return createTreg({
    tracking: getTracking,
    baseUrl,
    timeoutMs: TREG_TIMEOUT_MS,
    clock: Date.now,
  });
}

/**
 * The outside view, once a week: links to the site, where it ranks for the chosen searches and
 * whether ChatGPT names or cites it, through Treg. Paid, capped and checked against the budget.
 */
export const treg: Collector = createDefaultTreg(TREG_BASE_URL);
