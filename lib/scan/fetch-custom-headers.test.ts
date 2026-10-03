import type { LookupAddress } from "node:dns";
import type { IncomingMessage } from "node:http";
import { closeSites, fetchError, never, redirect, site } from "@/tests/helpers/http-site";
import { createSafeFetch } from "./fetch";
import { HostLimiter } from "./host-limiter";
import { TREG_HOST } from "./outbound-hosts";

afterEach(closeSites);

const KEY = "SENTINEL-treg-key-123";
const headers = { "x-treg-token": KEY, "x-treg-route-max-cost": "0.005" };
const post = { json: { query: "acme" }, headers };
const opts = { maxBytes: 1024, ignoreRobots: true, post } as const;

/** Treg's host and others all resolve to the local test site; loopback is allowed (tests only). */
function testFetch(over: { customHeaderHosts?: readonly string[] } = {}) {
  return createSafeFetch({
    allowedHosts: new Set([TREG_HOST, "docs.example.com", "www.googleapis.com"]),
    allowLoopback: true,
    timeoutMs: 5_000,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
    resolveHost: async (): Promise<LookupAddress[]> => [{ address: "127.0.0.1", family: 4 }],
    ...over,
  });
}

describe("safeFetch POST with custom headers", () => {
  it("sends the headers and the JSON body to treg.to, and gives back the response headers", async () => {
    const seen: IncomingMessage["headers"][] = [];
    const { port } = await site({
      "/call/x": (req, res) => {
        seen.push(req.headers);
        req.resume();
        req.on("end", () =>
          res
            .writeHead(200, { "x-treg-cost-micro": "2500", "x-treg-call-id": "abc" })
            .end('{"ok":true}'),
        );
      },
    });
    const response = await testFetch()(`http://${TREG_HOST}:${port}/call/x`, opts);
    expect(response.status).toBe(200);
    expect(response.headers["x-treg-cost-micro"]).toBe("2500");
    expect(response.headers["x-treg-call-id"]).toBe("abc");
    expect(seen[0]).toMatchObject({
      "x-treg-token": KEY,
      "x-treg-route-max-cost": "0.005",
      "content-type": "application/json",
    });
    expect(seen[0]?.authorization).toBeUndefined();
  });

  it.each([
    ["a product host", "docs.example.com"],
    ["a Google API host", "www.googleapis.com"],
  ])("refuses custom headers to %s", async (_name, host) => {
    const { port, hits } = await site({});
    const error = await fetchError(testFetch()(`http://${host}:${port}/x`, opts));
    expect(error.kind).toBe("network");
    expect(error.message).toBe(`${host} does not take custom headers`);
    expect(error.message).not.toContain(KEY);
    expect(hits).toEqual([]);
  });

  it("refuses a bearer POST to treg.to: the bearer path stays Google only", async () => {
    const { port, hits } = await site({});
    const error = await fetchError(
      testFetch()(`http://${TREG_HOST}:${port}/x`, {
        ...opts,
        post: { json: {}, bearer: KEY },
      }),
    );
    expect(error.message).toBe(`${TREG_HOST} is not a Google API host: only those take a POST`);
    expect(hits).toEqual([]);
  });

  it("refuses custom headers over plain http outside tests", async () => {
    const fetch = createSafeFetch({
      allowedHosts: new Set([TREG_HOST]),
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
      resolveHost: async (): Promise<LookupAddress[]> => [{ address: "127.0.0.1", family: 4 }],
    });
    const error = await fetchError(fetch(`http://${TREG_HOST}/x`, opts));
    expect(error.message).toBe(`A POST to ${TREG_HOST} must use https`);
  });

  it.each([
    ["a port", `https://${TREG_HOST}:8443/x`],
    ["a login", `https://user:pass@${TREG_HOST}/x`],
  ])("refuses %s on treg.to outside tests, before anything is sent", async (_name, url) => {
    const fetch = createSafeFetch({
      allowedHosts: new Set([TREG_HOST]),
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
      resolveHost: async (): Promise<LookupAddress[]> => [{ address: "127.0.0.1", family: 4 }],
    });
    const error = await fetchError(fetch(url, opts));
    expect(error.message).toBe(`${TREG_HOST} must be called without a port or login`);
    expect(error.message).not.toContain(KEY);
  });

  it("refuses a plain GET to treg.to: only the collector's POSTs go there", async () => {
    const { port, hits } = await site({});
    const error = await fetchError(
      testFetch()(`http://${TREG_HOST}:${port}/x`, { maxBytes: 1024, ignoreRobots: true }),
    );
    expect(error.message).toBe(`${TREG_HOST} only takes the Treg collector's calls`);
    expect(hits).toEqual([]);
  });

  it("hands back only the x-treg response headers from treg.to", async () => {
    const { port } = await site({
      "/x": (_req, res) =>
        res
          .writeHead(200, { "x-treg-cost-micro": "1", "set-cookie": "a=b", "x-other": "y" })
          .end("{}"),
    });
    const response = await testFetch()(`http://${TREG_HOST}:${port}/x`, opts);
    expect(Object.keys(response.headers)).toEqual(["x-treg-cost-micro"]);
    expect(response.headerLines).toEqual([["x-treg-cost-micro", "1"]]);
  });

  it("never follows a redirect, and never sends the key on", async () => {
    const { port, hits } = await site({ "/moved": redirect(`http://${TREG_HOST}:1/elsewhere`) });
    const error = await fetchError(testFetch()(`http://${TREG_HOST}:${port}/moved`, opts));
    expect(error.kind).toBe("redirect");
    expect(error.message).not.toContain(KEY);
    expect(hits).toEqual(["/moved"]);
  });

  it.each([
    ["a name outside the x-treg family", { authorization: "Bearer x" }],
    ["a host override", { host: "evil.example.com" }],
    ["a name with a space", { "x-treg-a b": "1" }],
    ["a value with a line break", { "x-treg-token": `${KEY}\r\nX-Evil: 1` }],
    ["a value with a control character", { "x-treg-token": `${KEY}\u0000` }],
    ["a non-ASCII value", { "x-treg-token": `${KEY}é` }],
    ["an empty value", { "x-treg-token": "" }],
    ["a repeated name in another case", { "x-treg-token": KEY, "X-Treg-Token": KEY }],
  ])("refuses %s before anything is sent", async (_name, bad) => {
    const { port, hits } = await site({});
    const error = await fetchError(
      testFetch()(`http://${TREG_HOST}:${port}/x`, { ...opts, post: { json: {}, headers: bad } }),
    );
    expect(error.kind).toBe("network");
    expect(error.message).not.toContain(KEY);
    expect(hits).toEqual([]);
  });

  it("honours a per-call timeout for treg.to", async () => {
    const { port } = await site({ "/slow": never });
    const started = performance.now();
    const error = await fetchError(
      testFetch()(`http://${TREG_HOST}:${port}/slow`, { ...opts, timeoutMs: 150 }),
    );
    expect(error.kind).toBe("timeout");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("takes custom headers only at the hosts it was built for", async () => {
    const { port } = await site({ "/ok": (_req, res) => res.writeHead(200).end("{}") });
    const fetch = testFetch({ customHeaderHosts: ["docs.example.com"] });
    expect((await fetch(`http://docs.example.com:${port}/ok`, opts)).status).toBe(200);
    const error = await fetchError(fetch(`http://${TREG_HOST}:${port}/ok`, opts));
    expect(error.message).toBe(`${TREG_HOST} does not take custom headers`);
  });
});
