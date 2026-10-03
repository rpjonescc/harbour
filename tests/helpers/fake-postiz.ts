/**
 * A local stand-in for a self-hosted Postiz's public API on 127.0.0.1. Its answers are recorded by
 * hand from docs.postiz.com (public-api: integrations list, posts create; checked 2026-10-04 against
 * Postiz v1.47.0) in tests/fixtures/postiz/. Every name and id is fictional; no real Postiz is called.
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const POSTIZ_KEY = "SENTINEL-postiz-key-7c1d";
export const CHANNELS: unknown[] = JSON.parse(
  readFileSync("tests/fixtures/postiz/integrations.json", "utf8"),
);
export const CREATED: unknown = JSON.parse(
  readFileSync("tests/fixtures/postiz/create-post.json", "utf8"),
);
/** The fixture's LinkedIn page, Facebook page and standalone Instagram channel ids. */
export const LINKEDIN_ID = "cm4ean69r0003w8w1cdomox9n";
export const FACEBOOK_ID = "cm4ean69r0004w8w1fbexample";
export const INSTAGRAM_ID = "cm4ean69r0005w8w1igexample";

export type PostizMode =
  | "ok"
  | "unauthorized"
  | "bad-request"
  | "forbidden"
  | "rate-limited"
  | "server-error"
  | "redirect"
  | "hang"
  | "huge"
  | "bad-json"
  | "wrong-shape"
  | "empty";

export type PostizCall = {
  method: string;
  path: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
};

type Answer = { status: number; body: unknown; headers?: Record<string, string> };

const FAULTS: Partial<Record<PostizMode, Answer>> = {
  unauthorized: { status: 401, body: { msg: "Invalid API key" } },
  "bad-request": { status: 400, body: { msg: "Integration with id x not found" } },
  forbidden: { status: 403, body: { msg: "forbidden" } },
  "rate-limited": { status: 429, body: { msg: "ThrottlerException: Too Many Requests" } },
  "server-error": { status: 500, body: { msg: "Internal server error" } },
  redirect: { status: 302, body: "", headers: { location: "http://192.0.2.1/steal" } },
  "wrong-shape": { status: 200, body: { nothing: "useful" } },
  empty: { status: 200, body: [] },
};

function answer(res: ServerResponse, mode: PostizMode, ok: unknown): void {
  if (mode === "hang") return;
  if (mode === "huge") {
    res.writeHead(200, { "content-type": "application/json" });
    const chunk = Buffer.alloc(64 * 1024, "a");
    for (let i = 0; i < 24; i++) res.write(chunk); // 1.5 MiB
    res.end();
    return;
  }
  if (mode === "bad-json") {
    res.writeHead(200, { "content-type": "application/json" }).end("{not json");
    return;
  }
  const { status, body, headers = {} } = FAULTS[mode] ?? { status: 200, body: ok };
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export type FakePostizOptions = {
  /** How GET /integrations answers. */
  list?: PostizMode;
  /** How POST /posts answers. */
  create?: PostizMode;
  channels?: unknown[];
};

const BASE = "/api/public/v1";

/** Starts the fake; `url` is the backend address Harbour is configured with (it ends in /api). */
export async function startFakePostiz(options: FakePostizOptions = {}) {
  const calls: PostizCall[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      calls.push({
        method: req.method ?? "",
        path,
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"],
        body,
      });
      if (req.headers.authorization !== POSTIZ_KEY) return answer(res, "unauthorized", null);
      if (req.method === "GET" && path === `${BASE}/integrations`) {
        return answer(res, options.list ?? "ok", options.channels ?? CHANNELS);
      }
      if (req.method === "POST" && path === `${BASE}/posts`) {
        return answer(res, options.create ?? "ok", CREATED);
      }
      res.writeHead(404, { "content-type": "application/json" }).end('{"msg":"not found"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api`,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
