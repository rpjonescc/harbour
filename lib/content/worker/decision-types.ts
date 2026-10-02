import type { Pillar } from "@/lib/agents/proposals";
import type { ReadIdea } from "@/lib/content/read/ideas";
import type { ReadPiece } from "@/lib/content/read/pieces";
import type { ContentProduct } from "@/lib/products/content";

/** A refusal in the words the owner reads; the job fails with exactly this sentence. */
export class DecisionRefusal extends Error {}

/**
 * What one decision does to the brain: files replaced, files that must be new (an export never
 * overwrites anything), files removed, and the commit message. Nothing here touches git or disk.
 */
export type Change = {
  write: Record<string, string>;
  create: Record<string, string>;
  remove: string[];
  message: string;
};

/** One decision as the job's string params carry it, already parsed. */
export type Decision = {
  action: "approve" | "edit" | "discard";
  revision?: number;
  flags: string;
  confirm?: string;
  body?: string;
};

export type DecisionContext = {
  root: string;
  day: string;
  product: ContentProduct;
  idea: ReadIdea;
  pieces: ReadPiece[];
  pillars: Pillar[];
};

export const STALE = "This piece changed since you opened it. Reload and try again.";
