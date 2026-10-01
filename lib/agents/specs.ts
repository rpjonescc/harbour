import { weeklyAnalystPrompt, weeklyPaths } from "@/lib/analyst/prompt";
import type { Product } from "@/lib/products/catalog";
import type { AllowedPaths } from "./brain-git";
import { discoveryPrompt, researchPrompt } from "./prompts";
import { RESEARCH_TOPICS } from "./topics";

export type AgentKind = "research" | "discovery" | "weekly-analyst";
/** The structured file a run writes for Harbour to import, if any. */
export type AgentOutput = { kind: "discovery" | "weekly"; path: string } | null;

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
};

export type SpecContext = {
  products: readonly Product[];
  today: string;
  /** The weekly analyst's capped export for `week` (worker only). */
  weeklyExport?: (week: string) => string;
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

function researchSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const topic = RESEARCH_TOPICS.find((t) => t.id === params.topic);
  if (!topic) throw new Error(`Unknown research topic: ${params.topic ?? "(none)"}`);
  return {
    kind: "research",
    label: `Research: ${topic.title}`,
    prompt: researchPrompt(topic, context.products, context.today),
    allowed: { prefixes: [], exact: [topic.path] },
    targets: [topic.path],
    output: null,
    requiredFiles: [],
    requiredOutputs: [],
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
  };
}

/** Turns a queued job's params into exactly what the agent may do. */
export function specForJob(
  kind: AgentKind,
  params: Record<string, string>,
  context: SpecContext,
): AgentSpec {
  if (kind === "research") return researchSpec(params, context);
  if (kind === "discovery") return discoverySpec(params, context);
  return weeklySpec(params, context);
}
