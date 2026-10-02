import type { Pillar } from "@/lib/agents/pillars";
import type { ContentProduct } from "@/lib/products/content";

/** What the digest agent is given: filtered snippets per product (worker memory only, never stored). */
export type DigestInputs = {
  day: string;
  window: { start: Date; end: Date };
  products: { productId: string; snippets: string[]; truncated: boolean }[];
};

/** The content machine's worker-side inputs, built once per job by the worker. */
export type ContentRunContext = {
  root: string;
  skillsDir: string;
  products: readonly ContentProduct[];
  excludeApps: readonly string[];
  /** The pillars the owner approved for a product (a read of the database). */
  approvedPillars: (productId: string) => Pillar[];
  digest?: DigestInputs;
};

/** The content inputs of a run, or a plain failure when the content machine is off. */
export function requireContent(context: { content?: ContentRunContext }): ContentRunContext {
  if (!context.content) {
    throw new Error("The content machine is off. Turn it on with HARBOUR_CONTENT=on.");
  }
  return context.content;
}
