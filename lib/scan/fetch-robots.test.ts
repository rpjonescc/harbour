import type { Handler } from "@/tests/helpers/http-site";
import { closeSites, fetchError, redirect, site, text } from "@/tests/helpers/http-site";
import { createSafeFetch } from "./fetch";
import { HostLimiter } from "./host-limiter";

afterEach(closeSites);

const testFetch = () =>
  createSafeFetch({
    allowedHosts: new Set(["127.0.0.1"]),
    allowLoopback: true,
    timeoutMs: 5_000,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
  });

const robots = "User-agent: *\nDisallow: /private\n";
const status =
  (code: number): Handler =>
  (_req, res) =>
    res.writeHead(code).end();

describe("safeFetch and robots.txt", () => {
  it("honours robots.txt by default, caching it per origin", async () => {
    const { origin, hits } = await site({ "/robots.txt": text(robots), "/open": text("ok") });
    const fetch = testFetch();
    const error = await fetchError(fetch(`${origin}/private/x`, { maxBytes: 64 }));
    expect(error.kind).toBe("blocked_by_robots");
    await fetch(`${origin}/open`, { maxBytes: 64 });
    expect(hits).toEqual(["/robots.txt", "/open"]);
  });

  it("skips robots.txt only when the caller opts out", async () => {
    const { origin, hits } = await site({ "/robots.txt": text(robots), "/private": text("ok") });
    const response = await testFetch()(`${origin}/private`, { maxBytes: 64, ignoreRobots: true });
    expect(response.body).toBe("ok");
    expect(hits).toEqual(["/private"]);
  });

  it("reads robots.txt once for concurrent requests to one origin", async () => {
    const { origin, hits } = await site({
      "/robots.txt": text(robots),
      "/a": text("a"),
      "/b": text("b"),
    });
    const fetch = testFetch();
    await Promise.all([
      fetch(`${origin}/a`, { maxBytes: 64 }),
      fetch(`${origin}/b`, { maxBytes: 64 }),
    ]);
    expect(hits.filter((path) => path === "/robots.txt")).toHaveLength(1);
  });

  it("keeps loading robots.txt for other callers when the first caller aborts", async () => {
    const { origin, hits } = await site({
      "/robots.txt": (req, res) => setTimeout(() => text(robots)(req, res), 100),
      "/page": text("ok"),
    });
    const fetch = testFetch();
    const controller = new AbortController();
    const first = fetch(`${origin}/page`, { maxBytes: 64, signal: controller.signal });
    const second = fetch(`${origin}/page`, { maxBytes: 64 });
    setTimeout(() => controller.abort(new Error("cancelled")), 20);
    await expect(first).rejects.toThrow("cancelled");
    await expect(second).resolves.toMatchObject({ body: "ok" });
    expect(hits).toEqual(["/robots.txt", "/page"]);
  });

  it("checks robots for every redirect hop", async () => {
    const { origin, hits } = await site({
      "/robots.txt": text(robots),
      "/go": redirect("/private/page"),
    });
    const error = await fetchError(testFetch()(`${origin}/go`, { maxBytes: 64 }));
    expect(error.kind).toBe("blocked_by_robots");
    expect(hits).toEqual(["/robots.txt", "/go"]);
  });

  it("allows everything when robots.txt is missing", async () => {
    const { origin } = await site({ "/page": text("ok") });
    const response = await testFetch()(`${origin}/page`, { maxBytes: 64 });
    expect(response.body).toBe("ok");
  });

  it.each([503, 429])("treats robots.txt status %i as disallow-all", async (code) => {
    const { origin } = await site({ "/robots.txt": status(code), "/page": text("ok") });
    const error = await fetchError(testFetch()(`${origin}/page`, { maxBytes: 64 }));
    expect(error.kind).toBe("blocked_by_robots");
  });

  it("reads an oversized robots.txt up to the cap instead of failing", async () => {
    const big = `User-agent: *\nDisallow: /private\n#${"x".repeat(600 * 1024)}\n`;
    const { origin } = await site({
      "/robots.txt": text(big, { "content-length": String(big.length) }),
    });
    const error = await fetchError(testFetch()(`${origin}/private`, { maxBytes: 64 }));
    expect(error.kind).toBe("blocked_by_robots");
  });
});
