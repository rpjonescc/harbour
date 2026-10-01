// The paid sources Harbour plans to use and the settings each needs. Web-safe: no secrets read
// here beyond whether a setting is present.
import type { Config } from "@/lib/config";

export type PaidSource = {
  id: "dataforseo" | "openai" | "perplexity" | "gemini";
  label: string;
  /** What Harbour will use it for. */
  provides: string;
  /** Every setting the source needs (secrets: only their presence is ever checked). */
  settings: readonly (keyof Config)[];
  /** The collector that calls it; null until that collector exists. */
  collector: string | null;
};

export const PAID_SOURCES: readonly PaidSource[] = [
  {
    id: "dataforseo",
    label: "DataForSEO",
    provides: "Google rankings, SERP features and AI Overviews",
    settings: ["HARBOUR_DATAFORSEO_LOGIN", "HARBOUR_DATAFORSEO_PASSWORD"],
    collector: null,
  },
  {
    id: "openai",
    label: "OpenAI",
    provides: "Whether ChatGPT search mentions and cites each product",
    settings: ["HARBOUR_OPENAI_API_KEY"],
    collector: null,
  },
  {
    id: "perplexity",
    label: "Perplexity",
    provides: "Whether Perplexity mentions and cites each product",
    settings: ["HARBOUR_PERPLEXITY_API_KEY"],
    collector: null,
  },
  {
    id: "gemini",
    label: "Gemini",
    provides: "Whether Gemini with Google grounding mentions and cites each product",
    settings: ["HARBOUR_GEMINI_API_KEY"],
    collector: null,
  },
];

/** Sources whose collector exists and whose every setting is present (none in this phase). */
export function connectedPaidSources(
  config: Config,
  sources: readonly PaidSource[] = PAID_SOURCES,
): PaidSource[] {
  return sources.filter(
    (source) =>
      source.collector !== null &&
      source.settings.every((key) => config[key] !== undefined && config[key] !== ""),
  );
}
