import type { ProductKind } from "@/lib/products/config";
import type { AreaKey, FormulaChange } from "@/lib/scan/views";

/** One fixed note per formula version, shown while the change is in the Product page's window. */
const NOTES: Readonly<Record<string, string>> = {
  v2: "Scoring updated: Preferred Sources now only counts for news sites.",
  v3:
    "Scoring updated: FAQ markup, llms.txt and AI training crawlers are still checked but no " +
    "longer count, so a move in Recommended by AI assistants or Answer-ready this time comes " +
    "from that change, not your site.",
};

/**
 * The areas whose score a formula version changed, per kind of site. Only a change in these is
 * not comparable with the version before; the rest of a score still says something about the
 * site. A version missing here is treated as changing every area, so a new formula never shows a
 * misleading change before someone has said what it touched.
 */
const AREAS_CHANGED: Readonly<Record<string, Readonly<Record<ProductKind, readonly AreaKey[]>>>> = {
  v2: { product: ["aeo"], news: [] },
  v3: { product: ["geo", "aeo"], news: ["geo", "aeo"] },
};

/** "v2" → 2; anything else (such as "v2.1") is NaN, which counts as an unknown version. */
const versionNumber = (version: string) =>
  /^v\d+$/.test(version) ? Number(version.slice(1)) : Number.NaN;

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

/**
 * The note for the first score on a new formula; null when there is no change, no note, or the
 * version changed nothing on this kind of site.
 */
export function scoringNote(change: FormulaChange | null, kind: ProductKind): string | null {
  if (!change || AREAS_CHANGED[change.to]?.[kind].length === 0) return null;
  return NOTES[change.to] ?? null;
}
