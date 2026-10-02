import { z } from "zod";

/** One piece of screen text with where it came from. App and window are "" when not given. */
export type Hit = { text: string; timestamp: string | null; app: string; window: string };
/** A row of /activity-summary's window list: how long a window was in use. */
export type WindowRow = { app: string; window: string; minutes: number };
export type Snippet = { app: string; window: string | null; text: string };
export type Activity = {
  dataStatus: "ok" | "empty_but_recording";
  snippets: Hit[];
  windows: WindowRow[];
  /** Items skipped because they were too long or not in the expected shape (a count, never text). */
  dropped: number;
};
export type Search = { hits: Hit[]; dropped: number };

/** A hit longer than this is dropped whole, never cut: a cut can leave half a secret. */
export const MAX_HIT_CHARS = 20_000;
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

type Parsed<T> = { items: T[]; dropped: number };

function readItems<I, T>(
  raw: readonly unknown[],
  max: number,
  schema: z.ZodType<I>,
  convert: (item: I) => T | null,
): Parsed<T> {
  const items: T[] = [];
  let dropped = 0;
  for (const entry of raw.slice(0, max)) {
    const parsed = schema.safeParse(entry);
    const value = parsed.success ? convert(parsed.data) : null;
    if (value === null) dropped += 1;
    else items.push(value);
  }
  return { items, dropped };
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

/** The text rows and windows of an /activity-summary answer, tolerant of rows it cannot read. */
export function readActivityLists(data: z.infer<typeof activitySchema>) {
  const snippets = readItems(data.snippets, MAX_ACTIVITY_SNIPPETS, activitySnippet, (s) =>
    hitOf(s.text, s.timestamp, s.app_name, s.window_name),
  );
  const windows = readItems(data.windows, MAX_WINDOWS, windowItem, (w) => ({
    app: w.app_name ?? "",
    window: w.window_name ?? "",
    minutes: w.minutes,
  }));
  return { snippets, windows };
}

/** OCR rows of a /search answer. Anything that is not an OCR row with `content` is skipped. */
export function readSearchHits(data: z.infer<typeof searchSchema>): Search {
  const { items, dropped } = readItems(data.data, SEARCH_LIMIT, searchItem, (item) =>
    item.type.toUpperCase() === "OCR"
      ? hitOf(
          item.content.text,
          item.content.timestamp,
          item.content.app_name,
          item.content.window_name,
        )
      : null,
  );
  return { hits: items, dropped };
}

/** `/health` is read for `status` only: the rest of it holds the machine's hostname. */
export const healthSchema = z.object({ status: z.string() });
