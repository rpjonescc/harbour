import type { ProductTracking } from "@/lib/products/config";
import type { TregCheck, TregProblem, TregStoppedBy, TregSummary } from "../treg-shapes";
import type { Observation } from "../types";
import { type CallOutcome, callEndpoint, type TregRun } from "./treg-client";
import { AI_CHATGPT, BACKLINKS, SERP_ORGANIC } from "./treg-endpoints";
import { hostMatches, mentionsProduct } from "./treg-match";

/** What a run's checks came to, before the summary is made. */
export type Tally = {
  observations: Observation[];
  ok: number;
  failed: number;
  problems: TregSummary["problems"];
  stoppedBy: TregStoppedBy;
};

/** What the checks are about: the product and what its owner chose to track. */
export type CheckInput = {
  name: string;
  domain: string;
  tracking: ProductTracking;
};

/** Failures in a row (not a known per-endpoint refusal) after which the run stops asking. */
const MAX_FAILURES_IN_A_ROW = 3;
/** Refusals about one endpoint only: they say nothing about the next call. */
const ENDPOINT_ONLY: readonly TregProblem[] = ["above_ceiling", "retired"];

type Task = {
  check: TregCheck;
  subject: string;
  ask: () => Promise<CallOutcome<Record<string, unknown>>>;
};

/** Where searches are made from when the owner named no place: the country's own name. */
function defaultLocation(country: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

/** Each check as one call, in the order they run: links, then each search, then each question. */
function tasks(run: TregRun, input: CheckInput, checkedAt: string): Task[] {
  const { domain, name, tracking } = input;
  const location = tracking.location ?? defaultLocation(tracking.country);
  const backlinks: Task = {
    check: "backlinks",
    subject: domain,
    ask: async () => {
      const out = await callEndpoint(run, BACKLINKS, { domain });
      if (out.kind !== "ok") return out;
      const provider = BACKLINKS.provider;
      return { kind: "ok", value: { ...out.value, provider, checkedAt } };
    },
  };
  const searches = tracking.queries.map(
    (query): Task => ({
      check: "serp_rank",
      subject: query,
      ask: async () => {
        const seen = { query, domain, location, languageCode: tracking.languageCode };
        const out = await callEndpoint(run, SERP_ORGANIC, seen);
        if (out.kind !== "ok") return out;
        return { kind: "ok", value: { query, ...out.value, checkedAt } };
      },
    }),
  );
  const questions = tracking.questions.map(
    (question): Task => ({
      check: "ai_answer",
      subject: question,
      ask: async () => {
        const asked = { question, country: tracking.country, domain, name };
        const out = await callEndpoint(run, AI_CHATGPT, asked);
        if (out.kind !== "ok") return out;
        const { text, sourceHosts, citedDomains, businessesNamed } = out.value;
        // The answer's text is read here and goes no further.
        const named = mentionsProduct(text, { name, domain });
        const cited = sourceHosts.some((host) => hostMatches(host, domain));
        const value = { question, named, cited, citedDomains, businessesNamed, checkedAt };
        return { kind: "ok", value };
      },
    }),
  );
  return [backlinks, ...searches, ...questions];
}

/**
 * Runs the checks one at a time, each independent of the others: a failed check is recorded and the
 * next one still runs. The run ends early on a reason that would repeat (budget, key, empty
 * balance, rate limit), after a few failures in a row, or past `deadline`.
 */
export async function runChecks(
  run: TregRun,
  input: CheckInput,
  limits: { clock: () => number; deadline: number },
): Promise<Tally> {
  const checkedAt = run.ctx.now.toISOString();
  const tally: Tally = { observations: [], ok: 0, failed: 0, problems: [], stoppedBy: "done" };
  let inARow = 0;
  // Bounded: at most 1 + 8 + 5 checks, each once.
  for (const task of tasks(run, input, checkedAt)) {
    run.ctx.signal.throwIfAborted();
    if (limits.clock() > limits.deadline) {
      tally.stoppedBy = "error";
      break;
    }
    const outcome = await task.ask();
    if (outcome.kind === "stop") {
      tally.stoppedBy = outcome.why;
      break;
    }
    if (outcome.kind === "ok") {
      tally.ok++;
      inARow = 0;
      tally.observations.push({ kind: task.check, subject: task.subject, value: outcome.value });
      continue;
    }
    tally.failed++;
    tally.problems.push({
      check: task.check,
      subject: task.subject.slice(0, 160),
      reason: outcome.problem,
    });
    if (!ENDPOINT_ONLY.includes(outcome.problem) && ++inARow >= MAX_FAILURES_IN_A_ROW) {
      tally.stoppedBy = "error";
      break;
    }
  }
  return tally;
}
