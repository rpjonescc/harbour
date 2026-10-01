import type { Product } from "@/lib/products/catalog";
import type { AllowedPaths } from "./brain-git";
import { discoveryPrompt, researchPrompt } from "./prompts";
import { RESEARCH_TOPICS } from "./topics";

export type AgentSpec = {
  kind: "research" | "discovery";
  label: string;
  prompt: string;
  allowed: AllowedPaths;
  targets: string[];
  proposalsPath: string | null;
  requiredFiles: string[];
};

/** Turns a queued job's params into exactly what the agent may do. */
export function specForJob(
  kind: "research" | "discovery",
  params: Record<string, string>,
  products: readonly Product[],
  today: string,
): AgentSpec {
  if (kind === "research") {
    const topic = RESEARCH_TOPICS.find((t) => t.id === params.topic);
    if (!topic) throw new Error(`Unknown research topic: ${params.topic ?? "(none)"}`);
    return {
      kind,
      label: `Research: ${topic.title}`,
      prompt: researchPrompt(topic, products, today),
      allowed: { prefixes: [], exact: [topic.path] },
      targets: [topic.path],
      proposalsPath: null,
      requiredFiles: [],
    };
  }
  const product = products.find((p) => p.id === params.productId);
  if (!product) throw new Error(`Unknown product: ${params.productId ?? "(none)"}`);
  const dir = `products/${product.id}`;
  const targets = [`${dir}/discovery.md`, `${dir}/proposals.json`];
  return {
    kind,
    label: `Discovery: ${product.name}`,
    prompt: discoveryPrompt(product, today),
    allowed: { prefixes: [], exact: targets },
    targets,
    proposalsPath: `${dir}/proposals.json`,
    requiredFiles: [`${dir}/notes.md`],
  };
}
