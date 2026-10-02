import { matchKey } from "./canonical";
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
  /** Rows Screenpipe sent, before any were skipped. */
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
  return filterSnippets(
    mergeWindows(rows)
      .filter((row) => !hasPrivateCue(row.window))
      .map((row) => ({ app: row.app, window: row.window, text: windowText(row) })),
    rules,
  );
}

/** One row per app and title (the same page can be listed once per address): minutes added up. */
function mergeWindows(rows: readonly WindowRow[]): WindowRow[] {
  const merged = new Map<string, WindowRow>();
  for (const row of rows) {
    const key = `${matchKey(row.app)}\u0000${matchKey(row.window)}`;
    const seen = merged.get(key);
    if (seen) seen.minutes += row.minutes;
    else merged.set(key, { ...row });
  }
  return [...merged.values()];
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
  const hits: Hit[] = [...activity.snippets.items];
  let rows = activity.snippets.rows;
  let skipped = activity.snippets.dropped + activity.windows.dropped;
  for (const term of usableTerms(terms).slice(0, MAX_TERMS)) {
    const found = await within((s) => fetchSearch(s, range, term));
    hits.push(...found.items);
    rows += found.rows;
    skipped += found.dropped;
  }
  const windows = keepWindows(activity.windows.items, rules);
  const excerpts = filterHits(hits, rules);
  return {
    snippets: [...windows.kept, ...excerpts.kept],
    truncated: windows.truncated || excerpts.truncated,
    hits: rows,
    windows: activity.windows.rows,
    skipped,
  };
}
