import type { LightTone } from "./tower";

// The one plain line at the top of every page (under its title): is it OK, what needs you, what is
// happening. Each page builds its own from real data in its own lib/explain module; the tone is
// shown by a status light's shape as well as its colour, and the sentence always says the same.

/** A page's verdict: one or two short sentences and the tone of the light beside them. */
export type PageVerdict = { tone: LightTone; text: string };

/** "1 draft" / "3 drafts": a count with its noun, singular or plural. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "is" or "are" for a count. */
export const isAre = (n: number): string => (n === 1 ? "is" : "are");

/** Joins sentences that may be missing, skipping the missing ones. */
export function sentences(...parts: readonly (string | null | false)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}
