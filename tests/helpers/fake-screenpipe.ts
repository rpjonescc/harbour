import { createServer } from "node:http";
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
export type FakeSnippet = { text: string; app_name: string; window_name?: string | null };
export type FakeRequest = {
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | undefined>;
};

const STATUS_BY_MODE: Partial<Record<FakeMode, string>> = {
  "not-recording": "not_recording",
  "no-capture": "no_capture_in_range",
  empty: "empty_but_recording",
  "unknown-status": "something_new",
};

/**
 * A local stand-in for Screenpipe's API on 127.0.0.1, replaying synthetic responses (never the
 * owner's data). Unknown fields are included on purpose: the client must ignore them.
 */
export async function startFakeScreenpipe(
  options: { mode?: FakeMode; snippets?: FakeSnippet[]; key?: string; port?: number } = {},
) {
  const { mode = "ok", snippets = [], key = "sp-test-key", port: wanted = 0 } = options;
  const requests: FakeRequest[] = [];
  let activityCalls = 0;
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
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/health") {
      return mode === "unhealthy"
        ? json(503, { status: "unhealthy" })
        : json(200, {
            status: "healthy",
            frame_status: "ok",
            hostname: "fake-host.example",
            extra: 1,
          });
    }
    activityCalls += 1;
    // Answers the first activity request, then refuses: a failure after text was already read.
    const refuseNow = mode === "forbidden" || (mode === "second-forbidden" && activityCalls > 1);
    if (req.headers.authorization !== `Bearer ${key}` || refuseNow) {
      return json(403, { error: "forbidden" });
    }
    if (mode === "hang") return; // never answers
    if (mode === "stall") {
      res.writeHead(200, { "content-type": "application/json" });
      return void res.write('{"data_status":'); // headers sent, body never finishes
    }
    if (mode === "redirect") {
      res.writeHead(302, { location: "http://192.0.2.1:3030/steal" });
      return res.end();
    }
    if (mode === "garbage") return json(200, { nothing: "useful" });
    if (mode === "bad-json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end("{not json");
    }
    if (mode === "huge") {
      res.writeHead(200, { "content-type": "application/json" });
      const chunk = Buffer.alloc(64 * 1024, "a");
      for (let i = 0; i < 48; i++) res.write(chunk); // 3 MiB
      return res.end();
    }
    return json(200, {
      data_status: STATUS_BY_MODE[mode] ?? "ok",
      query_status: "matched",
      snippets:
        mode === "ok" || mode === "second-forbidden"
          ? snippets.map((s) => ({ ...s, frame_id: 1 }))
          : [],
      apps: [{ name: "Ignored", minutes: 3 }],
      key_texts: ["ignored"],
    });
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
