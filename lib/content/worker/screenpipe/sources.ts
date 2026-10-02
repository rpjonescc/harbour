import {
  fetchActivity,
  fetchSearch,
  MAX_TERMS,
  REQUEST_TIMEOUT_MS,
  ScreenpipeError,
  type ScreenpipeSettings,
  usableTerms,
} from "./client";
import { hasPrivateCue } from "./frame-checks";
import { filterHits } from "./hits";
import { filterSnippets, type RedactRules } from "./redact";
import type { Hit, WindowRow } from "./schema";

const PRODUCT_BUDGET_MS = 60_000;

/** What one product's requests returned and what survived the filters: counts only. */
export type ProductSource = {
  snippets: string[];
  truncated: boolean;
  hits: number;
  windows: number;
  /** Items Screenpipe sent that were too long or not readable, never read further. */
  skipped: number;
};

/** A window row as the text a model may see: its title and how long it was in use. */
const windowText = (row: WindowRow): string => `${row.window} (${Math.round(row.minutes)} min)`;

/**
 * The window source (spec §18): rows whose app and title are present, pass the deny-lists and the
 * private-context cues, and whose title holds a content term.
 */
function keepWindows(rows: readonly WindowRow[], rules: RedactRules) {
  const candidates = rows
    .filter((row) => !hasPrivateCue(row.window))
    .map((row) => ({ app: row.app, window: row.window, text: windowText(row) }));
  return filterSnippets(candidates, rules);
}

/**
 * Everything the digest reads for one product over `range`: the window list and any text of
 * /activity-summary, then one /search per content term (at most ten, one after another). All of
 * a product's requests share a 60-second budget; running out fails like an unreachable Screenpipe.
 * Raw text lives only in this function's locals.
 */
export async function gatherProduct(
  settings: ScreenpipeSettings,
  range: { start: Date; end: Date },
  terms: readonly string[],
  rules: RedactRules,
): Promise<ProductSource> {
  const deadline = Date.now() + (settings.productBudgetMs ?? PRODUCT_BUDGET_MS);
  const within = async <T>(call: (s: ScreenpipeSettings) => Promise<T>): Promise<T> => {
    const left = deadline - Date.now();
    if (left <= 0) throw new ScreenpipeError("not-running");
    return call({
      ...settings,
      timeoutMs: Math.min(settings.timeoutMs ?? REQUEST_TIMEOUT_MS, left),
    });
  };
  const activity = await within((s) => fetchActivity(s, range, terms));
  const hits: Hit[] = [...activity.snippets];
  let skipped = activity.dropped;
  for (const term of usableTerms(terms).slice(0, MAX_TERMS)) {
    const found = await within((s) => fetchSearch(s, range, term));
    hits.push(...found.hits);
    skipped += found.dropped;
  }
  const windows = keepWindows(activity.windows, rules);
  const excerpts = filterHits(hits, rules);
  return {
    snippets: [...windows.kept, ...excerpts.kept],
    truncated: windows.truncated || excerpts.truncated,
    hits: hits.length,
    windows: activity.windows.length,
    skipped,
  };
}
