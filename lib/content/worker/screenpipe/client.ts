import { isLoopbackHttpOrigin } from "@/lib/config";
import { type FailureKind, ScreenpipeError } from "./errors";
import {
  type Activity,
  activitySchema,
  healthSchema,
  readActivityLists,
  readSearchHits,
  SEARCH_LIMIT,
  type Search,
  searchSchema,
} from "./schema";

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 15_000;
/** At most this many of a product's content terms are searched (one request each). */
export const MAX_TERMS = 10;

export { type FailureKind, ScreenpipeError } from "./errors";

export type ScreenpipeSettings = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** All of one product's requests together must finish within this (default 60 s). */
  productBudgetMs?: number;
  fetchFn?: typeof fetch;
};

const SENTENCE: Record<FailureKind, (day: string) => string> = {
  "not-running": (day) => `Screenpipe isn't running, so there is no activity digest for ${day}.`,
  "key-refused": () =>
    "Harbour's Screenpipe key was refused. Run `screenpipe auth token` and update `HARBOUR_SCREENPIPE_API_KEY`.",
  "not-recording": (day) =>
    `Screenpipe wasn't recording on ${day}, so there is no activity digest.`,
  "no-capture": (day) => `Screenpipe captured nothing on ${day}, so there is no activity digest.`,
  "too-large": (day) =>
    `Screenpipe's answer was too large to read safely, so there is no activity digest for ${day}.`,
  redirected: (day) =>
    `Screenpipe tried to send Harbour somewhere else, so there is no activity digest for ${day}.`,
  "bad-response": (day) =>
    `Screenpipe's answer wasn't in the expected shape, so there is no activity digest for ${day}.`,
};

/** The plain sentence for a failed digest (spec §5.6). */
export function describeFailure(kind: FailureKind, dayLabel: string): string {
  return SENTENCE[kind](dayLabel);
}

async function get(
  settings: ScreenpipeSettings,
  path: string,
  query: URLSearchParams,
  sendKey: boolean,
) {
  // Defence in depth beside the config check: the bearer key must never leave this machine.
  if (!isLoopbackHttpOrigin(settings.baseUrl))
    throw new Error("Screenpipe must be on this machine");
  // A key that is not a valid header value is a configuration mistake, not a Screenpipe outage.
  if (sendKey && !/^[\u0021-\u007e]+$/.test(settings.apiKey)) {
    throw new Error("The Screenpipe key is empty or has characters a header cannot hold");
  }
  const url = new URL(path, settings.baseUrl);
  url.search = query.toString();
  const headers: Record<string, string> = {
    "X-Screenpipe-Client": "api",
    "X-Screenpipe-Agent": "harbour",
    ...(sendKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
  };
  try {
    // Redirects are never followed (they could carry the key elsewhere): "manual" hands back the
    // 3xx itself, which is told apart from a dead server. No retries, one timeout for the whole read.
    const response = await (settings.fetchFn ?? fetch)(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(settings.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new ScreenpipeError("redirected");
    }
    return response;
  } catch (error) {
    if (error instanceof ScreenpipeError) throw error;
    throw new ScreenpipeError("not-running");
  }
}

/** The body as text, read as a stream and dropped as soon as it passes the cap. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new ScreenpipeError("bad-response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ScreenpipeError("too-large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ScreenpipeError) throw error;
    throw new ScreenpipeError("not-running"); // aborted by the timeout, or the socket dropped
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson<T>(response: Response, parse: (raw: unknown) => T | null): Promise<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readCapped(response));
  } catch (error) {
    if (error instanceof ScreenpipeError) throw error;
    throw new ScreenpipeError("bad-response");
  }
  const value = parse(raw);
  if (value === null) throw new ScreenpipeError("bad-response");
  return value;
}

/** Throws unless Screenpipe answers /health with status "healthy". The key is not sent. */
export async function checkHealth(settings: ScreenpipeSettings): Promise<void> {
  const response = await get(settings, "/health", new URLSearchParams(), false);
  // /health answers 503 with a body when unhealthy, so the status line is the whole verdict.
  if (!response.ok) {
    await response.body?.cancel();
    throw new ScreenpipeError("not-running");
  }
  const health = await readJson(response, (raw) => {
    const parsed = healthSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  });
  if (health.status !== "healthy") throw new ScreenpipeError("not-running");
}

/** Terms with something in them, trimmed and without repeats: an empty `q` could match everything. */
export function usableTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term !== ""))];
}

/** A GET with the key, whose body must parse; a refusal or odd status is the matching failure. */
async function getParsed<T>(
  settings: ScreenpipeSettings,
  path: string,
  query: URLSearchParams,
  parse: (raw: unknown) => T | null,
): Promise<T> {
  const response = await get(settings, path, query, true);
  if (!response.ok) {
    await response.body?.cancel();
    throw new ScreenpipeError(
      response.status === 401 || response.status === 403 ? "key-refused" : "bad-response",
    );
  }
  return readJson(response, parse);
}

/** One bounded /activity-summary call for a product's terms over `range` (spec §5.2, §18). */
export async function fetchActivity(
  settings: ScreenpipeSettings,
  range: { start: Date; end: Date },
  terms: readonly string[],
): Promise<Activity> {
  const usable = usableTerms(terms).slice(0, MAX_TERMS);
  if (usable.length === 0) throw new Error("Screenpipe needs at least one content term");
  const query = new URLSearchParams({
    start_time: range.start.toISOString(),
    end_time: range.end.toISOString(),
    q: usable.join(" "),
    include_memories: "false",
    include_key_texts: "false",
    include_recording: "false",
    include_guidance: "false",
    include_apps: "false",
    include_windows: "true",
    max_snippets: "30",
    max_snippet_chars: "240",
  });
  const parsed = await getParsed(settings, "/activity-summary", query, (raw) => {
    const result = activitySchema.safeParse(raw);
    return result.success ? result.data : null;
  });
  if (parsed.data_status === "not_recording") throw new ScreenpipeError("not-recording");
  if (parsed.data_status === "no_capture_in_range") throw new ScreenpipeError("no-capture");
  const { snippets, windows } = readActivityLists(parsed);
  return { dataStatus: parsed.data_status, snippets, windows };
}

/** One /search call for a single term: OCR rows only, the first page, no paging (spec §18). */
export async function fetchSearch(
  settings: ScreenpipeSettings,
  range: { start: Date; end: Date },
  term: string,
): Promise<Search> {
  const q = term.trim();
  if (q === "") throw new Error("Screenpipe needs a content term to search for");
  const query = new URLSearchParams({
    content_type: "ocr",
    q,
    start_time: range.start.toISOString(),
    end_time: range.end.toISOString(),
    limit: String(SEARCH_LIMIT),
    offset: "0",
  });
  const parsed = await getParsed(settings, "/search", query, (raw) => {
    const result = searchSchema.safeParse(raw);
    return result.success ? result.data : null;
  });
  return readSearchHits(parsed);
}
