import type { FormulaChange } from "@/lib/scan/views";

/** One fixed note per formula version, shown while the change is in the Product page's window. */
const NOTES: Readonly<Record<string, string>> = {
  v2: "Scoring updated: Preferred Sources now only counts for news sites.",
};

/** The note for the first score on a new formula; null when there is no change or no note. */
export function scoringNote(change: FormulaChange | null): string | null {
  return change ? (NOTES[change.to] ?? null) : null;
}
