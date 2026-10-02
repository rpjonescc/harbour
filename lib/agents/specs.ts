import { z } from "zod";
import { ANALYST_PROMPT_VERSION, weeklyAnalystPrompt, weeklyPaths } from "@/lib/analyst/prompt";
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

export type AgentKind = "research" | "discovery" | "weekly-analyst" | "daily-note";
/** The structured file a run writes for Harbour to import, if any. */
export type AgentOutput = { kind: "discovery" | "weekly"; path: string } | null;

export type SpecReview = {
  check: (root: string) => string | null;
  retryPrompt: (reason: string) => string;
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
};

export type SpecContext = {
  products: readonly Product[];
  today: string;
  /** The weekly analyst's capped export for `week` (worker only). */
  weeklyExport?: (week: string) => string;
  /** The daily note's facts snapshot, built when the job starts (worker only). */
  noteFacts?: () => Facts;
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
  return {
    kind: "discovery",
    label: `Discovery: ${product.name}`,
    prompt: discoveryPrompt(product, context.today),
    allowed: { prefixes: [], exact: [...targets] },
    targets,
    output,
    requiredFiles: [`${dir}/notes.md`],
    requiredOutputs: [proposals],
    promptVersion: PROMPT_VERSION,
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
  throw new Error(`Not an agent job: ${kind}`);
}
