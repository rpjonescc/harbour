import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** A one-shot local web server waiting for Google's redirect back after sign-in. */
export type Loopback = {
  /** `http://127.0.0.1:<port>/callback`, to register in the consent URL. */
  redirectUri: string;
  /** The authorisation code; rejects on timeout, a refused sign-in or too many bad requests. */
  code: Promise<string>;
};

type LoopbackOptions = { state: string; timeoutMs: number; maxRequests?: number };

const PATH = "/callback";
/** Browsers also ask for /favicon.ico and the like; anything beyond this is not a browser. */
const DEFAULT_MAX_REQUESTS = 20;

const page = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>` +
  `<body><h1>${title}</h1><p>${text}</p></body></html>`;

const DONE = page(
  "Harbour received Google's answer",
  "You can close this tab and go back to the terminal.",
);
const NOT_COMPLETED = page("Sign-in not completed", "Go back to the terminal for details.");

function reply(res: ServerResponse, status: number, body: string, type = "text/plain") {
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
    connection: "close",
  });
  res.end(body);
}

function sameState(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const [a, b] = [Buffer.from(received), Buffer.from(expected)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Google's error codes are short snake_case words; keep nothing else from the query string. */
function errorCode(value: string): string {
  return /^[a-z_]{1,64}$/.test(value) ? value : "unknown_error";
}

type Outcome = { code: string } | { error: Error } | null;

/** What one request means: the code, a refused sign-in, or nothing (answered 400/404). */
function handle(req: IncomingMessage, res: ServerResponse, state: string): Outcome {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method !== "GET" || url.pathname !== PATH) {
    reply(res, 404, "Not found");
    return null;
  }
  if (!sameState(url.searchParams.get("state"), state)) {
    reply(res, 400, "This sign-in link does not belong to the running pnpm gsc:connect.");
    return null;
  }
  const error = url.searchParams.get("error");
  if (error !== null) {
    reply(res, 400, NOT_COMPLETED, "text/html");
    return { error: new Error(`Google sign-in did not complete (${errorCode(error)}).`) };
  }
  const code = url.searchParams.get("code");
  if (!code) {
    reply(res, 400, "The callback has no authorisation code.");
    return null;
  }
  reply(res, 200, DONE, "text/html");
  return { code };
}

/** Listens on 127.0.0.1 on a free port until one valid callback, the timeout or too many requests. */
export async function startLoopback(options: LoopbackOptions): Promise<Loopback> {
  const { state, timeoutMs, maxRequests = DEFAULT_MAX_REQUESTS } = options;
  const server = createServer();
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 8;
  const code = new Promise<string>((resolve, reject) => {
    let requests = 0;
    const finish = (outcome: { code: string } | { error: Error }) => {
      clearTimeout(timer);
      server.removeAllListeners("request");
      server.close();
      server.closeAllConnections();
      if ("code" in outcome) resolve(outcome.code);
      else reject(outcome.error);
    };
    const timer = setTimeout(() => {
      const minutes = Math.round(timeoutMs / 60_000);
      const span = minutes >= 1 ? `${minutes} minutes` : `${timeoutMs} ms`;
      finish({ error: new Error(`No answer from Google sign-in within ${span}: run it again.`) });
    }, timeoutMs);
    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      requests += 1;
      const outcome = handle(req, res, state);
      // "close" fires whether or not the browser read the whole page.
      if (outcome) res.once("close", () => finish(outcome));
      else if (requests >= maxRequests) {
        finish({ error: new Error("Too many unexpected requests to the sign-in callback.") });
      }
    });
  });
  // Callers attach their own handlers later; this avoids an unhandled rejection meanwhile.
  code.catch(() => {});
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  // Listening on a TCP host and port, so the address is an AddressInfo, never a pipe name.
  const { port } = server.address() as AddressInfo;
  return { redirectUri: `http://127.0.0.1:${port}${PATH}`, code };
}
