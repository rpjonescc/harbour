import type { ProductKind } from "@/lib/products/config";
import type { AreaKey, FormulaChange } from "@/lib/scan/views";

/** One fixed note per formula version, shown while the change is in the Product page's window. */
const NOTES: Readonly<Record<string, string>> = {
  v2: "Scoring updated: Preferred Sources now only counts for news sites.",
};

/**
 * The areas whose score a formula version changed, per kind of site. Only a change in these is
 * not comparable with the version before; the rest of a score still says something about the
 * site. A version missing here is treated as changing every area, so a new formula never shows a
 * misleading change before someone has said what it touched.
 */
const AREAS_CHANGED: Readonly<Record<string, Readonly<Record<ProductKind, readonly AreaKey[]>>>> = {
  v2: { product: ["aeo"], news: [] },
};

const versionNumber = (version: string) => Number.parseInt(version.replace(/^\D+/, ""), 10);

/**
 * Whether a score in `area` was computed on a different formula in `to` than in `from` (versions
 * like "v2"), so that a change between them measures the formula rather than the site.
 */
export function formulaChangedArea(
  kind: ProductKind,
  area: AreaKey,
  from: string,
  to: string,
): boolean {
  if (from === to) return false;
  const [low, high] = [versionNumber(from), versionNumber(to)].sort((a, b) => a - b);
  if (low === undefined || high === undefined || Number.isNaN(low + high)) return true;
  for (let n = low + 1; n <= high; n++) {
    const changed = AREAS_CHANGED[`v${n}`];
    if (!changed || changed[kind].includes(area)) return true;
  }
  return false;
}

/** Whether a formula version has a note to show beside its first scores. */
export function hasScoringNote(version: string): boolean {
  return version in NOTES;
}

/** The note for the first score on a new formula; null when there is no change or no note. */
export function scoringNote(change: FormulaChange | null): string | null {
  return change ? (NOTES[change.to] ?? null) : null;
}
