import { isLoopbackHttpOrigin } from "@/lib/config";
import { type Activity, activitySchema, healthSchema } from "./schema";

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

export type FailureKind =
  | "not-running"
  | "key-refused"
  | "not-recording"
  | "no-capture"
  | "too-large"
  | "bad-response";

/** A Screenpipe problem with a kind the digest job turns into a plain sentence. */
export class ScreenpipeError extends Error {
  constructor(readonly kind: FailureKind) {
    super(kind);
  }
}

export type ScreenpipeSettings = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
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
  key: boolean,
) {
  // Defence in depth beside the config check: the bearer key must never leave this machine.
  if (!isLoopbackHttpOrigin(settings.baseUrl))
    throw new Error("Screenpipe must be on this machine");
  const url = new URL(path, settings.baseUrl);
  url.search = query.toString();
  const headers: Record<string, string> = {
    "X-Screenpipe-Client": "api",
    "X-Screenpipe-Agent": "harbour",
    ...(key ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
  };
  try {
    // No redirects (they could carry the key elsewhere), no retries, one timeout for the whole read.
    return await (settings.fetchFn ?? fetch)(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(settings.timeoutMs ?? TIMEOUT_MS),
    });
  } catch {
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
  if (!response.ok) throw new ScreenpipeError("not-running");
  const health = await readJson(response, (raw) => {
    const parsed = healthSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  });
  if (health.status !== "healthy") throw new ScreenpipeError("not-running");
}

/** One bounded /activity-summary call for a product's terms over `range` (spec §5.2). */
export async function fetchActivity(
  settings: ScreenpipeSettings,
  range: { start: Date; end: Date },
  terms: readonly string[],
): Promise<Activity> {
  const query = new URLSearchParams({
    start_time: range.start.toISOString(),
    end_time: range.end.toISOString(),
    q: terms.join(" "),
    include_memories: "false",
    include_key_texts: "false",
    include_recording: "false",
    include_guidance: "false",
    include_apps: "false",
    max_snippets: "30",
    max_snippet_chars: "240",
  });
  const response = await get(settings, "/activity-summary", query, true);
  if (response.status === 401 || response.status === 403) throw new ScreenpipeError("key-refused");
  if (!response.ok) throw new ScreenpipeError("bad-response");
  const parsed = await readJson(response, (raw) => {
    const result = activitySchema.safeParse(raw);
    return result.success ? result.data : null;
  });
  if (parsed.data_status === "not_recording") throw new ScreenpipeError("not-recording");
  if (parsed.data_status === "no_capture_in_range") throw new ScreenpipeError("no-capture");
  return {
    dataStatus: parsed.data_status,
    snippets: parsed.snippets.map((s) => ({
      app: s.app_name,
      window: s.window_name ?? null,
      text: s.text,
    })),
  };
}
