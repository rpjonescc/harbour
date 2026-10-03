import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeMode =
  | "ok"
  | "empty"
  | "forbidden"
  | "unhealthy"
  | "hang"
  | "stall"
  | "huge"
  | "not-recording"
  | "no-capture"
  | "garbage"
  | "bad-json"
  | "unknown-status"
  | "redirect"
  | "second-forbidden";
export type FakeSnippet = {
  text: string;
  app_name: string;
  window_name?: string | null;
  /** "ocr" unless given ("audio" rows carry a speaker and no app or window). */
  source?: string;
  speaker?: string;
};
/** A /search hit: Screenpipe's OCR rows carry empty app and window names unless given here. */
export type FakeHit = {
  text: string;
  timestamp?: string;
  app_name?: string;
  window_name?: string | null;
};
export type FakeWindow = { app_name: string; window_name: string; minutes: number };
export type FakeRequest = {
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | undefined>;
};
export type FakeOptions = {
  /** How /activity-summary answers. */
  mode?: FakeMode;
  snippets?: FakeSnippet[];
  /** The `windows` list /activity-summary carries (Screenpipe's real shape, extra fields included). */
  windows?: FakeWindow[];
  /** How /search answers: every call, or only call number `searchOnly` (counting from 1). */
  searchMode?: FakeMode;
  searchOnly?: number;
  /** The OCR hits /search serves for every query (the fake does not match `q`), or raw items. */
  hits?: FakeHit[];
  searchItems?: unknown[];
  /** A pagination total to claim, whatever was returned. */
  searchTotal?: number;
  key?: string;
  port?: number;
};

const STATUS_BY_MODE: Partial<Record<FakeMode, string>> = {
  "not-recording": "not_recording",
  "no-capture": "no_capture_in_range",
  empty: "empty_but_recording",
  "unknown-status": "something_new",
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** The failures every endpoint shares; null means "answer normally". */
function fault(mode: FakeMode, res: ServerResponse, firstBody: string): boolean {
  if (mode === "hang") return true; // never answers
  if (mode === "stall") {
    res.writeHead(200, { "content-type": "application/json" });
    res.write(firstBody); // headers sent, body never finishes
    return true;
  }
  if (mode === "redirect") {
    res.writeHead(302, { location: "http://192.0.2.1:3030/steal" });
    res.end();
    return true;
  }
  if (mode === "garbage") {
    json(res, 200, { nothing: "useful" });
    return true;
  }
  if (mode === "bad-json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{not json");
    return true;
  }
  if (mode === "huge") {
    res.writeHead(200, { "content-type": "application/json" });
    const chunk = Buffer.alloc(64 * 1024, "a");
    for (let i = 0; i < 48; i++) res.write(chunk); // 3 MiB
    res.end();
    return true;
  }
  return false;
}

const ocrItem = (hit: FakeHit) => ({
  type: "OCR",
  content: {
    text: hit.text,
    timestamp: hit.timestamp ?? "2026-10-01T10:00:00Z",
    app_name: hit.app_name ?? "",
    window_name: hit.window_name ?? "",
    browser_url: "",
    frame_id: 1,
    file_path: "ignored",
  },
});

/**
 * A local stand-in for Screenpipe's API on 127.0.0.1, replaying synthetic responses (never the
 * owner's data). Unknown fields are included on purpose: the client must ignore them.
 */
export async function startFakeScreenpipe(options: FakeOptions = {}) {
  const { mode = "ok", snippets = [], key = "sp-test-key", port: wanted = 0 } = options;
  const { windows = [], searchMode = "ok", hits = [] } = options;
  const requests: FakeRequest[] = [];
  let activityCalls = 0;
  let searchCalls = 0;

  const activity = (res: ServerResponse, mode: FakeMode) => {
    if (fault(mode, res, '{"data_status":')) return;
    json(res, 200, {
      data_status: STATUS_BY_MODE[mode] ?? "ok",
      query_status: "matched",
      snippets:
        mode === "ok" || mode === "second-forbidden"
          ? snippets.map((s) => ({ source: "ocr", ...s, frame_id: 1 }))
          : [],
      windows: mode === "ok" || mode === "second-forbidden" ? windows.map(windowRow) : [],
      apps: [{ name: "Ignored", minutes: 3 }],
      key_texts: ["ignored"],
    });
  };
  const search = (res: ServerResponse, mode: FakeMode) => {
    if (fault(mode, res, '{"data":[')) return;
    const data = mode === "ok" ? (options.searchItems ?? hits.map(ocrItem)) : [];
    json(res, 200, {
      data,
      pagination: { limit: 25, offset: 0, total: options.searchTotal ?? data.length },
    });
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: {
        authorization: req.headers.authorization,
        client: req.headers["x-screenpipe-client"] as string | undefined,
        agent: req.headers["x-screenpipe-agent"] as string | undefined,
      },
    });
    if (url.pathname === "/health") {
      return mode === "unhealthy"
        ? json(res, 503, { status: "unhealthy" })
        : json(res, 200, {
            status: "healthy",
            frame_status: "ok",
            hostname: "fake-host.example",
            extra: 1,
          });
    }
    const isSearch = url.pathname === "/search";
    if (isSearch) searchCalls += 1;
    else activityCalls += 1;
    const searchFaulty = options.searchOnly === undefined || options.searchOnly === searchCalls;
    const answerMode = isSearch ? (searchFaulty ? searchMode : "ok") : mode;
    // "second-forbidden" answers the first activity request, then refuses: a failure after text
    // was already read.
    const refuseNow =
      answerMode === "forbidden" || (answerMode === "second-forbidden" && activityCalls > 1);
    if (req.headers.authorization !== `Bearer ${key}` || refuseNow) {
      return json(res, 403, { error: "forbidden" });
    }
    return isSearch ? search(res, answerMode) : activity(res, answerMode);
  });
  await new Promise<void>((resolve) => server.listen(wanted, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const windowRow = (w: FakeWindow) => ({ ...w, browser_url: "", frame_count: 3 });
