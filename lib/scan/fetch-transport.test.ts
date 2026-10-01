import type { LookupAddress } from "node:dns";
import { getEventListeners } from "node:events";
import { deflateRawSync, deflateSync, gzipSync } from "node:zlib";
import { closeSites, fetchError, never, site, text } from "@/tests/helpers/http-site";
import { createSafeFetch } from "./fetch";
import { HostLimiter } from "./host-limiter";

afterEach(closeSites);

type Settings = Partial<Parameters<typeof createSafeFetch>[0]>;

/** Loopback allowed, no spacing; `names` resolve as given instead of through DNS. */
function testFetch(settings: Settings = {}, names: Record<string, string> = {}) {
  return createSafeFetch({
    allowedHosts: new Set(["127.0.0.1", ...Object.keys(names)]),
    allowLoopback: true,
    timeoutMs: 5_000,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
    resolveHost: async (hostname): Promise<LookupAddress[]> => {
      const address = names[hostname];
      if (!address) throw new Error(`no test address for ${hostname}`);
      return [{ address, family: address.includes(":") ? 6 : 4 }];
    },
    ...settings,
  });
}

const opts = { maxBytes: 1024, ignoreRobots: true } as const;

describe("safeFetch address checks at connect time", () => {
  it("refuses a name that resolves to a private address when it connects", async () => {
    const { port, hits } = await site({ "/": text("hi") });
    let lookups = 0;
    const fetch = createSafeFetch({
      allowedHosts: new Set(["rebind.example.com"]),
      allowLoopback: false,
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
      resolveHost: async () => {
        lookups++;
        return [{ address: "10.0.0.7", family: 4 }];
      },
    });
    const error = await fetchError(fetch(`http://rebind.example.com:${port}/`, opts));
    expect(error.kind).toBe("network");
    expect(error.message).toContain("Refused non-public host rebind.example.com");
    expect(lookups).toBe(1);
    expect(hits).toEqual([]);
  });

  it("refuses when any of a name's addresses is private", async () => {
    const fetch = createSafeFetch({
      allowedHosts: new Set(["mixed.example.com"]),
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
      resolveHost: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.5", family: 4 },
      ],
    });
    const error = await fetchError(fetch("http://mixed.example.com/", opts));
    expect(error.message).toContain("Refused non-public host");
  });

  it("connects to the address the checked lookup returned", async () => {
    const { port } = await site({ "/": text("via lookup") });
    const fetch = testFetch({}, { "docs.example.com": "127.0.0.1" });
    const response = await fetch(`http://docs.example.com:${port}/`, opts);
    expect(response.body).toBe("via lookup");
  });
});

describe("safeFetch headers", () => {
  it("keeps headers named like Object properties as plain values", async () => {
    const { origin } = await site({
      "/": (_req, res) => res.writeHead(200, ["__proto__", "one", "constructor", "two"]).end(),
    });
    const { headers } = await testFetch()(`${origin}/`, opts);
    expect(Object.entries(headers)).toEqual(
      expect.arrayContaining([
        ["__proto__", "one"],
        ["constructor", "two"],
      ]),
    );
    expect(headers.constructor).toBe("two");
  });
});

describe("safeFetch content encodings", () => {
  const encoded = (encoding: string, body: Buffer) => () =>
    site({
      "/": (_req, res) =>
        res
          .writeHead(200, { "content-type": "text/plain", "content-encoding": encoding })
          .end(body),
    });

  it("decodes zlib-wrapped and raw deflate", async () => {
    for (const [body, expected] of [
      [deflateSync("wrapped"), "wrapped"],
      [deflateRawSync("raw"), "raw"],
    ] as const) {
      const { origin } = await encoded("deflate", body)();
      expect((await testFetch()(`${origin}/`, opts)).body).toBe(expected);
    }
  });

  it("treats identity as no encoding", async () => {
    const { origin } = await encoded("identity", Buffer.from("plain"))();
    expect((await testFetch()(`${origin}/`, opts)).body).toBe("plain");
  });

  it.each(["gzip, br", "compress", "zstd"])("refuses unsupported encoding %s", async (enc) => {
    const { origin } = await encoded(enc, gzipSync("x"))();
    const error = await fetchError(testFetch()(`${origin}/`, opts));
    expect(error.kind).toBe("network");
    expect(error.message).toContain("unsupported encoding");
  });

  it("caps the decoded size, not the compressed size", async () => {
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024, "a"));
    const { origin } = await encoded("gzip", bomb)();
    const fetch = testFetch();
    const response = await fetch(`${origin}/`, opts);
    expect(response).toMatchObject({ truncated: true, body: "a".repeat(1024) });
    const strict = { ...opts, onOverflow: "error" } as const;
    expect((await fetchError(fetch(`${origin}/`, strict))).kind).toBe("too_large");
  });
});

describe("safeFetch timeouts and aborts", () => {
  it("honours a per-call timeout only for Google API hosts", async () => {
    const late = (_req: unknown, res: { end: (body: string) => void }) =>
      setTimeout(() => res.end("late"), 300);
    const { port } = await site({ "/late": late, "/slow": never });
    const fetch = testFetch(
      { timeoutMs: 100 },
      { "www.googleapis.com": "127.0.0.1", "docs.example.com": "127.0.0.1" },
    );
    const google = await fetch(`http://www.googleapis.com:${port}/late`, {
      ...opts,
      timeoutMs: 2_000,
    });
    expect(google.body).toBe("late");
    const other = fetch(`http://docs.example.com:${port}/late`, { ...opts, timeoutMs: 2_000 });
    const error = await fetchError(other);
    expect(error.kind).toBe("timeout");
    expect(error.message).toContain("100 ms");
  });

  it("stops reading the body when the caller aborts mid-body", async () => {
    const { origin } = await site({
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("partial");
      },
    });
    const controller = new AbortController();
    const run = testFetch()(`${origin}/`, { ...opts, signal: controller.signal });
    setTimeout(() => controller.abort(new Error("cancelled")), 100);
    const started = performance.now();
    await expect(run).rejects.toThrow("cancelled");
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("leaves no abort listener on the caller's signal once done", async () => {
    const { origin } = await site({ "/": text("done") });
    const controller = new AbortController();
    const fetch = testFetch();
    await fetch(`${origin}/`, { ...opts, signal: controller.signal });
    await fetch(`${origin}/`, { ...opts, signal: controller.signal });
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});
