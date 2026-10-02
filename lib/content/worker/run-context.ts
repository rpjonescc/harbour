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
  digest?: DigestInputs;
};
