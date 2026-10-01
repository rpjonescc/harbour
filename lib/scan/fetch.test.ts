import { closeSites, fetchError, never, redirect, site, text } from "@/tests/helpers/http-site";
import { createSafeFetch, HARBOUR_USER_AGENT } from "./fetch";
import { HostLimiter } from "./host-limiter";

afterEach(closeSites);

/** Test settings: loopback allowed, no spacing, a timeout that only the timeout tests hit. */
const testFetch = (overrides: Partial<Parameters<typeof createSafeFetch>[0]> = {}) =>
  createSafeFetch({
    allowedHosts: new Set(["127.0.0.1", "localhost"]),
    allowLoopback: true,
    timeoutMs: 5_000,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
    ...overrides,
  });

/** These tests are about HTTP limits, not robots (see fetch-robots.test.ts). */
const opts = { maxBytes: 1024, ignoreRobots: true } as const;

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
    const response = await testFetch()(`${origin}/page`, { ...opts, accept: "text/html" });
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
    const response = await testFetch()(`${origin}/missing`, opts);
    expect(response.status).toBe(404);
    expect(response.body).toBe("not found");
  });

  it("times out when the server never answers", async () => {
    const { origin } = await site({ "/slow": never });
    const error = await fetchError(testFetch({ timeoutMs: 100 })(`${origin}/slow`, opts));
    expect(error.kind).toBe("timeout");
  });

  it("times out when the body stalls after the headers", async () => {
    const { origin } = await site({
      "/stall": (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("partial");
      },
    });
    const error = await fetchError(testFetch({ timeoutMs: 100 })(`${origin}/stall`, opts));
    expect(error.kind).toBe("timeout");
  });

  it("follows up to three redirects on the same site", async () => {
    const { origin, hits } = await site({
      "/1": redirect("/2"),
      "/2": redirect("/3"),
      "/3": redirect("/final"),
      "/final": text("done"),
    });
    const response = await testFetch()(`${origin}/1`, opts);
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
    const error = await fetchError(testFetch()(`${origin}/1`, opts));
    expect(error.kind).toBe("redirect");
  });

  it("refuses a redirect to another site without requesting it", async () => {
    const { origin } = await site({ "/away": redirect("https://example.org/elsewhere") });
    const error = await fetchError(testFetch()(`${origin}/away`, opts));
    expect(error.kind).toBe("redirect");
    expect(error.message).toContain("example.org");
  });

  it("refuses a start URL outside the allowed hosts without any request", async () => {
    const { origin, hits } = await site({ "/page": text("hi") });
    const fetch = testFetch({ allowedHosts: new Set(["example.com"]) });
    const error = await fetchError(fetch(`${origin}/page`, { maxBytes: 64 }));
    expect(error.kind).toBe("network");
    expect(error.message).toContain("not an allowed host");
    expect(hits).toEqual([]);
  });

  it("refuses a same-site redirect to a host outside the allowed hosts", async () => {
    const { port, hits } = await site({
      "/go": (req, res) => redirect(`http://www.${req.headers.host}/next`)(req, res),
    });
    const fetch = testFetch({ allowedHosts: new Set(["localhost"]) });
    const error = await fetchError(fetch(`http://localhost:${port}/go`, opts));
    expect(error.kind).toBe("redirect");
    expect(error.message).toContain("not an allowed host");
    expect(hits).toEqual(["/go"]);
  });

  it("truncates a streamed body at the byte cap by default", async () => {
    const { origin } = await site({
      "/big": (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("a".repeat(600));
        res.end("b".repeat(600));
      },
    });
    const response = await testFetch()(`${origin}/big`, { ...opts, maxBytes: 1000 });
    expect(response.truncated).toBe(true);
    expect(response.body).toBe("a".repeat(600) + "b".repeat(400));
  });

  it("truncates a body whose declared length exceeds the cap by default", async () => {
    const { origin } = await site({
      "/huge": text("x".repeat(2000), { "content-length": "2000" }),
    });
    const response = await testFetch()(`${origin}/huge`, { ...opts, maxBytes: 1000 });
    expect(response).toMatchObject({ truncated: true, body: "x".repeat(1000) });
  });

  it("throws too_large for any oversized body when onOverflow is error", async () => {
    const { origin } = await site({
      "/declared": text("x".repeat(2000), { "content-length": "2000" }),
      "/streamed": (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("a".repeat(600));
        res.end("b".repeat(600));
      },
    });
    const fetch = testFetch();
    for (const path of ["/declared", "/streamed"]) {
      const options = { ...opts, maxBytes: 1000, onOverflow: "error" } as const;
      const error = await fetchError(fetch(`${origin}${path}`, options));
      expect(error.kind).toBe("too_large");
    }
  });

  it("spaces requests to one host through the process-wide limiter by default", async () => {
    const { origin, arrivals } = await site({ "/a": text("a"), "/b": text("b") });
    const settings = { allowedHosts: new Set(["127.0.0.1"]), allowLoopback: true };
    const [first, second] = [createSafeFetch(settings), createSafeFetch(settings)];
    await Promise.all([first(`${origin}/a`, opts), second(`${origin}/b`, opts)]);
    const [a = 0, b = 0] = arrivals;
    expect(arrivals).toHaveLength(2);
    expect(b - a).toBeGreaterThanOrEqual(400);
  });

  it("makes no request once the signal is aborted", async () => {
    const { origin, hits } = await site({ "/page": text("hi") });
    const signal = AbortSignal.abort(new Error("cancelled"));
    await expect(testFetch()(`${origin}/page`, { ...opts, signal })).rejects.toThrow("cancelled");
    expect(hits).toEqual([]);
  });

  it("refuses loopback and private hosts unless loopback is allowed", async () => {
    const { origin, hits } = await site({ "/page": text("hi") });
    const fetch = createSafeFetch({
      allowedHosts: new Set(["127.0.0.1", "localhost", "10.0.0.1"]),
    });
    for (const url of [`${origin}/page`, "http://localhost/", "http://10.0.0.1/"]) {
      const error = await fetchError(fetch(url, opts));
      expect(error.kind).toBe("network");
    }
    expect(hits).toEqual([]);
  });

  it("refuses schemes other than http and https", async () => {
    const error = await fetchError(testFetch()("file:///etc/passwd", opts));
    expect(error.kind).toBe("network");
  });
});
