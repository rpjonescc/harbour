import { scoringNote } from "@/lib/explain/scoring-notes";
import type { ProductKind } from "@/lib/products/config";
import type { FormulaChange } from "@/lib/scan/views";

/** A quiet line explaining why a score moved when the formula changed, not the site. */
export function ScoringNote({ change, kind }: { change: FormulaChange | null; kind: ProductKind }) {
  const note = scoringNote(change, kind);
  if (note === null) return null;
  return <p className="text-xs text-ink-muted">{note}</p>;
}
