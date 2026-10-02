import { z } from "zod";
import { ANALYST_PROMPT_VERSION, weeklyAnalystPrompt, weeklyPaths } from "@/lib/analyst/prompt";
import { atomiseSpec } from "@/lib/content/worker/atomise";
import { digestSpec } from "@/lib/content/worker/digest";
import { draftSpec } from "@/lib/content/worker/draft";
import { gateSpec } from "@/lib/content/worker/gate";
import { ideasSpec } from "@/lib/content/worker/ideas";
import type { ContentRunContext } from "@/lib/content/worker/run-context";
import type { Facts } from "@/lib/explain/voice/facts";
import { dailyNoteSpec } from "@/lib/note/spec";
import type { Product } from "@/lib/products/catalog";
import type { AllowedPaths } from "./brain-git";
import {
  discoveryPrompt,
  PROMPT_VERSION,
  REFRESH_PROMPT_VERSION,
  refreshPrompt,
  researchPrompt,
} from "./prompts";
import { RESEARCH_TOPICS } from "./topics";

export type AgentKind =
  | "research"
  | "discovery"
  | "weekly-analyst"
  | "daily-note"
  | "content-digest"
  | "content-ideas"
  | "content-draft"
  | "content-atomise"
  | "content-gate";
/** The structured file a run writes for Harbour to import, if any. */
export type AgentOutput = { kind: "discovery" | "weekly"; path: string } | null;

export type SpecReview = {
  check: (root: string) => string | null;
  retryPrompt: (reason: string) => string;
  /** Removes the rejected output before the retry (the agent cannot overwrite it). */
  reset: (root: string) => void;
  /**
   * Moves the accepted output to where it is committed and shown, just before the commit.
   * Returns the short result recorded on the job: what binds the shown output to what was checked.
   */
  publish: (root: string, note: (text: string) => void) => string;
};

export type AgentSpec = {
  kind: AgentKind;
  label: string;
  prompt: string;
  allowed: AllowedPaths;
  targets: string[];
  output: AgentOutput;
  /** Brain files that must exist before the run starts. */
  requiredFiles: string[];
  /** Brain files the run must write, or it fails and nothing is committed. */
  requiredOutputs: string[];
  /** Recorded with the run, so output can be traced to the prompt that produced it. */
  promptVersion: string;
  /** The tools this run gets, instead of the default research set. */
  tools?: readonly string[];
  /** A shorter timeout than HARBOUR_AGENT_TIMEOUT_MINUTES (never a longer one). */
  timeoutMs?: number;
  /** Checks what the run wrote before it is committed; one rejection earns one retry. */
  review?: SpecReview;
  /** Keep the agent's own words (stream text, output tails) out of the run record. */
  quiet?: boolean;
  /**
   * The agent's files may echo raw screen text. A discard deletes what the agent itself wrote
   * instead of keeping it in quarantine (anything else a discard moves is kept, as ever).
   */
  noQuarantine?: boolean;
  /** The prompt travels on stdin (long prompts, and prompts that hold screen text). */
  stdin?: boolean;
  /** What a quiet run says when the agent did not finish (default: the daily note's line). */
  quietFailure?: string;
};

export type SpecContext = {
  products: readonly Product[];
  today: string;
  /** The weekly analyst's capped export for `week` (worker only). */
  weeklyExport?: (week: string) => string;
  /** The daily note's facts snapshot, built when the job starts (worker only). */
  noteFacts?: () => Facts;
  /** The job being run: content runs name their work file after it. */
  jobId: number;
  /** The content machine's worker-side inputs (set only when content is on). */
  content?: ContentRunContext;
  /** The worker clock, for timestamps a step records. */
  now?: () => Date;
};

/** Where a job's structured output lives, from its params alone (also used to re-import it). */
export function outputForJob(kind: AgentKind, params: Record<string, string>): AgentOutput {
  if (kind === "discovery") {
    return { kind: "discovery", path: `products/${params.productId ?? ""}/proposals.json` };
  }
  if (kind === "weekly-analyst") {
    return { kind: "weekly", path: weeklyPaths(params.week ?? "").proposals };
  }
  return null;
}

// `month` is the scheduled refresh round that queued the job (the schedule's once-a-month key).
const ResearchParams = z.strictObject({
  topic: z.string(),
  mode: z.literal("refresh").optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function researchSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const topic = RESEARCH_TOPICS.find((t) => t.id === params.topic);
  if (!topic) throw new Error(`Unknown research topic: ${params.topic ?? "(none)"}`);
  const parsed = ResearchParams.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid research params for ${topic.id}`);
  const refresh = parsed.data.mode === "refresh";
  return {
    kind: "research",
    label: `${refresh ? "Refresh" : "Research"}: ${topic.title}`,
    prompt: (refresh ? refreshPrompt : researchPrompt)(topic, context.products, context.today),
    allowed: { prefixes: [], exact: [topic.path] },
    targets: [topic.path],
    output: null,
    // A refresh re-checks an existing document; it never writes a first draft unasked.
    requiredFiles: refresh ? [topic.path] : [],
    requiredOutputs: [],
    promptVersion: refresh ? REFRESH_PROMPT_VERSION : PROMPT_VERSION,
  };
}

function discoverySpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const product = context.products.find((p) => p.id === params.productId);
  if (!product) throw new Error(`Unknown product: ${params.productId ?? "(none)"}`);
  const dir = `products/${product.id}`;
  const proposals = `${dir}/proposals.json`;
  const targets = [`${dir}/discovery.md`, proposals];
  const output = outputForJob("discovery", { productId: product.id });
  // Pillars are proposed only for products with content on (they shape content ideas).
  const withPillars = Boolean(context.content?.products.some((p) => p.id === product.id));
  return {
    kind: "discovery",
    label: `Discovery: ${product.name}`,
    prompt: discoveryPrompt(product, context.today, withPillars),
    allowed: { prefixes: [], exact: [...targets] },
    targets,
    output,
    requiredFiles: [`${dir}/notes.md`],
    requiredOutputs: [proposals],
    promptVersion: withPillars ? `${PROMPT_VERSION}-pillars` : PROMPT_VERSION,
  };
}

function weeklySpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const week = params.week ?? "";
  const paths = weeklyPaths(week); // throws on anything but YYYY-Www
  if (!context.weeklyExport) throw new Error("The weekly export is not available");
  const targets = [paths.report, paths.proposals];
  return {
    kind: "weekly-analyst",
    label: `Weekly report: ${week}`,
    prompt: weeklyAnalystPrompt({
      week,
      today: context.today,
      products: context.products,
      exportJson: context.weeklyExport(week),
    }),
    allowed: { prefixes: [], exact: [...targets] },
    targets,
    output: outputForJob("weekly-analyst", { week }),
    requiredFiles: [],
    requiredOutputs: [...targets],
    promptVersion: ANALYST_PROMPT_VERSION,
  };
}

/** Turns a queued job's params into exactly what the agent may do; throws for any other kind. */
export function specForJob(
  kind: string,
  params: Record<string, string>,
  context: SpecContext,
): AgentSpec {
  if (kind === "research") return researchSpec(params, context);
  if (kind === "discovery") return discoverySpec(params, context);
  if (kind === "weekly-analyst") return weeklySpec(params, context);
  if (kind === "daily-note") return dailyNoteSpec(params, context);
  if (kind === "content-digest") return digestSpec(params, context);
  if (kind === "content-ideas") return ideasSpec(params, context);
  if (kind === "content-draft") return draftSpec(params, context);
  if (kind === "content-atomise") return atomiseSpec(params, context);
  if (kind === "content-gate") return gateSpec(params, context);
  throw new Error(`Not an agent job: ${kind}`);
}
