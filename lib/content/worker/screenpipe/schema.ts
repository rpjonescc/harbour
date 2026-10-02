import { z } from "zod";
import { ScreenpipeError } from "./errors";

/** One piece of screen text with where it came from. App and window are "" when not given. */
export type Hit = { text: string; timestamp: string | null; app: string; window: string };
/** A row of /activity-summary's window list: how long a window was in use. */
export type WindowRow = { app: string; window: string; minutes: number };
export type Snippet = { app: string; window: string | null; text: string };
/** What was read from a list: the rows Screenpipe sent, the ones kept and the ones skipped (counts only). */
export type Counted<T> = { items: T[]; rows: number; dropped: number };
export type Activity = {
  dataStatus: "ok" | "empty_but_recording";
  snippets: Counted<Hit>;
  windows: Counted<WindowRow>;
};
export type Search = Counted<Hit>;

/** A hit longer than this is dropped whole, never cut: a cut can leave half a secret. */
export const MAX_HIT_CHARS = 10_000;
/** /search is asked for this many rows per term and no more are read. */
export const SEARCH_LIMIT = 25;
const MAX_WINDOWS = 200;
const MAX_ACTIVITY_SNIPPETS = 100;

const NAME = z.string().max(500);
const TIMESTAMP = z.string().max(64);

/**
 * The only fields read from /activity-summary. A plain `z.object` drops every other field
 * unread (key texts, memories, apps, guidance): the less of the owner's screen Harbour sees, the
 * less can leak. An unknown `data_status` fails the parse rather than being read as "ok". The two
 * lists are read item by item, so one odd row is skipped and counted instead of failing the day.
 */
export const activitySchema = z.object({
  data_status: z.enum(["ok", "empty_but_recording", "no_capture_in_range", "not_recording"]),
  snippets: z.array(z.unknown()).default([]),
  windows: z.array(z.unknown()).default([]),
});

const activitySnippet = z.object({
  source: z.string().max(40).nullish(),
  text: z.string(),
  app_name: NAME.nullish(),
  window_name: NAME.nullish(),
  timestamp: TIMESTAMP.nullish(),
});
const windowItem = z.object({
  app_name: NAME.nullish(),
  window_name: NAME.nullish(),
  minutes: z.number().finite().nonnegative().max(1440),
});

/** `/search?content_type=ocr` answers `{ data: [{ type, content: {...} }], pagination }`. */
export const searchSchema = z.object({ data: z.array(z.unknown()) });
const searchItem = z.object({
  type: z.string(),
  content: z.object({
    text: z.string(),
    timestamp: TIMESTAMP.nullish(),
    app_name: NAME.nullish(),
    window_name: NAME.nullish(),
  }),
});

/** What `convert` answers for a row that is readable but must not be used (not an error). */
const SKIP = Symbol("skip");

function readItems<I, T>(
  raw: readonly unknown[],
  max: number,
  schema: z.ZodType<I>,
  convert: (item: I) => T | null | typeof SKIP,
): Counted<T> & { unreadable: number } {
  const rows = raw.slice(0, max);
  const items: T[] = [];
  let unreadable = 0;
  for (const entry of rows) {
    const parsed = schema.safeParse(entry);
    const value = parsed.success ? convert(parsed.data) : null;
    if (value === null) unreadable += 1;
    else if (value !== SKIP) items.push(value);
  }
  return { items, rows: rows.length, dropped: rows.length - items.length, unreadable };
}

/**
 * Rows came but not one could be used because they were unreadable: Screenpipe's shape has changed
 * under Harbour, which must not read as a quiet day.
 */
function requireReadable<T>(list: Counted<T> & { unreadable: number }): Counted<T> {
  if (list.rows > 0 && list.items.length === 0 && list.unreadable > 0) {
    throw new ScreenpipeError("bad-response");
  }
  return { items: list.items, rows: list.rows, dropped: list.dropped };
}

const hitOf = (
  text: string,
  timestamp: string | null | undefined,
  app: string | null | undefined,
  window: string | null | undefined,
): Hit | null =>
  text.length > MAX_HIT_CHARS
    ? null
    : { text, timestamp: timestamp ?? null, app: app ?? "", window: window ?? "" };

/** Sources that are text read off the screen; audio and anything unknown never go on. */
const SCREEN_SOURCES = new Set(["ocr", "screen"]);

/** The text rows and windows of an /activity-summary answer, tolerant of rows it cannot read. */
export function readActivityLists(data: z.infer<typeof activitySchema>) {
  const snippets = readItems(data.snippets, MAX_ACTIVITY_SNIPPETS, activitySnippet, (s) => {
    // A transcript, or a row of unknown source, is never used; and (unlike a /search row) a snippet
    // must name its app and window, since nothing else vouches for it.
    if (!SCREEN_SOURCES.has((s.source ?? "").toLowerCase())) return SKIP;
    if ((s.app_name ?? "") === "" || (s.window_name ?? "") === "") return SKIP;
    return hitOf(s.text, s.timestamp, s.app_name, s.window_name);
  });
  const windows = readItems(data.windows, MAX_WINDOWS, windowItem, (w) => ({
    app: w.app_name ?? "",
    window: w.window_name ?? "",
    minutes: w.minutes,
  }));
  return { snippets: requireReadable(snippets), windows: requireReadable(windows) };
}

/** OCR rows of a /search answer. Anything that is not an OCR row with `content` is skipped. */
export function readSearchHits(data: z.infer<typeof searchSchema>): Search {
  const list = readItems(data.data, SEARCH_LIMIT, searchItem, (item) =>
    item.type.toUpperCase() === "OCR"
      ? hitOf(
          item.content.text,
          item.content.timestamp,
          item.content.app_name,
          item.content.window_name,
        )
      : null,
  );
  // A reply with rows that all had to be skipped (unreadable, the wrong type or too long) is not a quiet day.
  if (list.rows > 0 && list.items.length === 0) throw new ScreenpipeError("bad-response");
  return { items: list.items, rows: list.rows, dropped: list.dropped };
}

/** `/health` is read for `status` only: the rest of it holds the machine's hostname. */
export const healthSchema = z.object({ status: z.string() });
