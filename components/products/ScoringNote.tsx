import { scoringNote } from "@/lib/explain/scoring-notes";
import type { FormulaChange } from "@/lib/scan/views";

/** A quiet line explaining why a score moved when the formula changed, not the site. */
export function ScoringNote({ change }: { change: FormulaChange | null }) {
  const note = scoringNote(change);
  if (note === null) return null;
  return <p className="text-xs text-ink-muted">{note}</p>;
}
