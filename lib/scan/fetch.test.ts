import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createSafeFetch, FetchError, HARBOUR_USER_AGENT, safeFetch } from "./fetch";
import { HostLimiter } from "./host-limiter";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A local site whose routes the test defines; records every request path it receives. */
async function site(routes: Record<string, Handler>) {
  const hits: string[] = [];
  const arrivals: number[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    arrivals.push(performance.now());
    const handler = routes[req.url ?? ""];
    if (handler) handler(req, res);
    else res.writeHead(404).end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  servers.push(server);
  return { origin, hits, arrivals };
}

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const text =
  (body: string, headers: Record<string, string> = {}): Handler =>
  (_req, res) =>
    res.writeHead(200, { "content-type": "text/plain", ...headers }).end(body);
const redirect =
  (location: string): Handler =>
  (_req, res) =>
    res.writeHead(301, { location }).end();
const never: Handler = () => {};

/** Test settings: loopback allowed, no spacing, a timeout that only the timeout tests hit. */
const testFetch = (overrides: Parameters<typeof createSafeFetch>[0] = {}) =>
  createSafeFetch({
    allowLoopback: true,
    timeoutMs: 5_000,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
    ...overrides,
  });

/** Milliseconds between the first two requests the site received. */
function firstGap(arrivals: readonly number[]): number {
  const [first, second] = arrivals;
  if (first === undefined || second === undefined) throw new Error("expected two requests");
  return second - first;
}

async function fetchError(promise: Promise<unknown>): Promise<FetchError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof FetchError)) throw new Error(`expected a FetchError, got ${error}`);
  return error;
}

describe("safeFetch", () => {
  it("returns the response with lowercased headers and identifies itself", async () => {
    let agent = "";
    let accept = "";
    const { origin } = await site({
      "/page": (req, res) => {
        agent = req.headers["user-agent"] ?? "";
        accept = req.headers.accept ?? "";
        text("hello", { "X-Thing": "1" })(req, res);
      },
    });
    const response = await testFetch()(`${origin}/page`, { maxBytes: 1024, accept: "text/html" });
    expect(response).toMatchObject({
      url: `${origin}/page`,
      finalUrl: `${origin}/page`,
      status: 200,
      body: "hello",
      truncated: false,
    });
    expect(response.headers["x-thing"]).toBe("1");
    expect(response.ms).toBeGreaterThanOrEqual(0);
    expect(agent).toBe(HARBOUR_USER_AGENT);
    expect(accept).toBe("text/html");
  });

  it("returns error statuses as responses", async () => {
    const { origin } = await site({});
    const response = await testFetch()(`${origin}/missing`, { maxBytes: 1024 });
    expect(response.status).toBe(404);
    expect(response.body).toBe("not found");
  });

  it("times out when the server never answers", async () => {
    const { origin } = await site({ "/slow": never });
    const error = await fetchError(
      testFetch({ timeoutMs: 100 })(`${origin}/slow`, { maxBytes: 1024 }),
    );
    expect(error.kind).toBe("timeout");
  });

  it("times out when the body stalls after the headers", async () => {
    const { origin } = await site({
      "/stall": (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("partial");
      },
    });
    const error = await fetchError(
      testFetch({ timeoutMs: 100 })(`${origin}/stall`, { maxBytes: 1024 }),
    );
    expect(error.kind).toBe("timeout");
  });

  it("follows up to three redirects on the same site", async () => {
    const { origin, hits } = await site({
      "/1": redirect("/2"),
      "/2": redirect("/3"),
      "/3": redirect("/final"),
      "/final": text("done"),
    });
    const response = await testFetch()(`${origin}/1`, { maxBytes: 1024 });
    expect(response).toMatchObject({
      url: `${origin}/1`,
      finalUrl: `${origin}/final`,
      body: "done",
    });
    expect(hits).toEqual(["/1", "/2", "/3", "/final"]);
  });

  it("refuses a fourth redirect", async () => {
    const { origin } = await site({
      "/1": redirect("/2"),
      "/2": redirect("/3"),
      "/3": redirect("/4"),
      "/4": redirect("/final"),
      "/final": text("done"),
    });
    const error = await fetchError(testFetch()(`${origin}/1`, { maxBytes: 1024 }));
    expect(error.kind).toBe("redirect");
  });

  it("refuses a redirect to another site without requesting it", async () => {
    const { origin } = await site({ "/away": redirect("https://example.org/elsewhere") });
    const error = await fetchError(testFetch()(`${origin}/away`, { maxBytes: 1024 }));
    expect(error.kind).toBe("redirect");
    expect(error.message).toContain("example.org");
  });

  it("truncates a streamed body at the byte cap", async () => {
    const { origin } = await site({
      "/big": (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("a".repeat(600));
        res.end("b".repeat(600));
      },
    });
    const response = await testFetch()(`${origin}/big`, { maxBytes: 1000 });
    expect(response.truncated).toBe(true);
    expect(response.body).toBe("a".repeat(600) + "b".repeat(400));
  });

  it("refuses a body whose declared length exceeds the cap", async () => {
    const { origin } = await site({
      "/huge": text("x".repeat(2000), { "content-length": "2000" }),
    });
    const error = await fetchError(testFetch()(`${origin}/huge`, { maxBytes: 1000 }));
    expect(error.kind).toBe("too_large");
  });

  it("spaces requests to one host through the limiter", async () => {
    const { origin, arrivals } = await site({ "/a": text("a"), "/b": text("b") });
    const fetch = testFetch({ limiter: new HostLimiter({ concurrency: 2, spacingMs: 150 }) });
    await Promise.all([
      fetch(`${origin}/a`, { maxBytes: 64 }),
      fetch(`${origin}/b`, { maxBytes: 64 }),
    ]);
    expect(firstGap(arrivals)).toBeGreaterThanOrEqual(100);
  });

  it("shares the global per-host limiter across instances by default", async () => {
    const { origin, arrivals } = await site({ "/a": text("a"), "/b": text("b") });
    const first = createSafeFetch({ allowLoopback: true });
    const second = createSafeFetch({ allowLoopback: true });
    await Promise.all([
      first(`${origin}/a`, { maxBytes: 64 }),
      second(`${origin}/b`, { maxBytes: 64 }),
    ]);
    expect(firstGap(arrivals)).toBeGreaterThanOrEqual(400);
  });

  it("makes no request once the signal is aborted", async () => {
    const { origin, hits } = await site({ "/page": text("hi") });
    const promise = testFetch()(`${origin}/page`, {
      maxBytes: 64,
      signal: AbortSignal.abort(new Error("cancelled")),
    });
    await expect(promise).rejects.toThrow("cancelled");
    expect(hits).toEqual([]);
  });

  it("refuses loopback and private hosts in production", async () => {
    const { origin, hits } = await site({ "/page": text("hi") });
    for (const url of [`${origin}/page`, "http://localhost/", "http://10.0.0.1/"]) {
      const error = await fetchError(safeFetch(url, { maxBytes: 64 }));
      expect(error.kind).toBe("network");
    }
    expect(hits).toEqual([]);
  });

  it("refuses schemes other than http and https", async () => {
    const error = await fetchError(testFetch()("file:///etc/passwd", { maxBytes: 64 }));
    expect(error.kind).toBe("network");
  });
});

describe("safeFetch with respectRobots", () => {
  const robots = "User-agent: *\nDisallow: /private\n";

  it("refuses disallowed paths without requesting them and caches robots.txt per origin", async () => {
    const { origin, hits } = await site({ "/robots.txt": text(robots), "/open": text("ok") });
    const fetch = testFetch();
    const error = await fetchError(
      fetch(`${origin}/private/x`, { maxBytes: 64, respectRobots: true }),
    );
    expect(error.kind).toBe("blocked_by_robots");
    await fetch(`${origin}/open`, { maxBytes: 64, respectRobots: true });
    expect(hits).toEqual(["/robots.txt", "/open"]);
  });

  it("reads robots.txt once for concurrent requests to one origin", async () => {
    const { origin, hits } = await site({
      "/robots.txt": text(robots),
      "/a": text("a"),
      "/b": text("b"),
    });
    const fetch = testFetch();
    await Promise.all([
      fetch(`${origin}/a`, { maxBytes: 64, respectRobots: true }),
      fetch(`${origin}/b`, { maxBytes: 64, respectRobots: true }),
    ]);
    expect(hits.filter((path) => path === "/robots.txt")).toHaveLength(1);
  });

  it("checks robots for every redirect hop", async () => {
    const { origin, hits } = await site({
      "/robots.txt": text(robots),
      "/go": redirect("/private/page"),
    });
    const error = await fetchError(
      testFetch()(`${origin}/go`, { maxBytes: 64, respectRobots: true }),
    );
    expect(error.kind).toBe("blocked_by_robots");
    expect(hits).toEqual(["/robots.txt", "/go"]);
  });

  it("allows everything when robots.txt is missing", async () => {
    const { origin } = await site({ "/page": text("ok") });
    const response = await testFetch()(`${origin}/page`, { maxBytes: 64, respectRobots: true });
    expect(response.body).toBe("ok");
  });

  it("treats a server error on robots.txt as disallow-all", async () => {
    const { origin } = await site({
      "/robots.txt": (_req, res) => res.writeHead(503).end(),
      "/page": text("ok"),
    });
    const error = await fetchError(
      testFetch()(`${origin}/page`, { maxBytes: 64, respectRobots: true }),
    );
    expect(error.kind).toBe("blocked_by_robots");
  });

  it("ignores robots.txt unless asked", async () => {
    const { origin } = await site({ "/robots.txt": text(robots), "/private": text("ok") });
    const response = await testFetch()(`${origin}/private`, { maxBytes: 64 });
    expect(response.body).toBe("ok");
  });
});
