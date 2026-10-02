/**
 * The four parts behind "What's this?" (spec §2): what it is, why Harbour checks it, what to do
 * and why it's worth it.
 */
export type FourParts = { what: string; why: string; todo: string; worth: string };

/** The parts in the order they are shown. */
export const PART_ORDER: readonly (keyof FourParts)[] = ["what", "why", "todo", "worth"];

/** Each part's heading. */
export const PART_LABELS: Readonly<Record<keyof FourParts, string>> = {
  what: "What it is",
  why: "Why Harbour checks it",
  todo: "What to do",
  worth: "Why it's worth it",
};

/** True when every part has words in it: an explainer never opens onto a blank. */
export function isComplete(parts: FourParts): boolean {
  return PART_ORDER.every((part) => parts[part].trim().length > 0);
}
