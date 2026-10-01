import type { LookupAddress } from "node:dns";
import type { IncomingMessage } from "node:http";
import { closeSites, fetchError, redirect, site } from "@/tests/helpers/http-site";
import { createSafeFetch } from "./fetch";
import { HostLimiter } from "./host-limiter";

afterEach(closeSites);

const GOOGLE = "www.googleapis.com";
const TOKEN = "test-access-token-abc";

/** Google's API host and a product host both resolve to the local test site. */
function testFetch() {
  return createSafeFetch({
    allowedHosts: new Set([GOOGLE, "docs.example.com"]),
    allowLoopback: true,
    timeoutMs: 5_000,
    limiter: new HostLimiter({ concurrency: 2, spacingMs: 0 }),
    resolveHost: async (): Promise<LookupAddress[]> => [{ address: "127.0.0.1", family: 4 }],
  });
}

type Seen = { method?: string; headers: IncomingMessage["headers"]; body: string };

const post = { json: { dimensions: ["date"] }, bearer: TOKEN };
const opts = { maxBytes: 1024, ignoreRobots: true, accept: "application/json", post } as const;

describe("safeFetch POST to Google APIs", () => {
  it("sends the JSON body with the bearer token and reads the answer", async () => {
    const seen: Seen[] = [];
    const { port } = await site({
      "/query": (req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          seen.push({ method: req.method, headers: req.headers, body });
          res.writeHead(200, { "content-type": "application/json" }).end('{"rows":[]}');
        });
      },
    });
    const response = await testFetch()(`http://${GOOGLE}:${port}/query`, opts);
    expect(response).toMatchObject({ status: 200, body: '{"rows":[]}' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ dimensions: ["date"] });
  });

  it("refuses to POST to a host that is not a Google API host", async () => {
    const { port, hits } = await site({});
    const error = await fetchError(testFetch()(`http://docs.example.com:${port}/x`, opts));
    expect(error.kind).toBe("network");
    expect(error.message).toBe("docs.example.com is not a Google API host: only those take a POST");
    expect(hits).toEqual([]);
  });

  it("never follows a redirect with the token", async () => {
    const { port, hits } = await site({ "/moved": redirect("/elsewhere") });
    const error = await fetchError(testFetch()(`http://${GOOGLE}:${port}/moved`, opts));
    expect(error.kind).toBe("redirect");
    expect(error.message).not.toContain(TOKEN);
    expect(hits).toEqual(["/moved"]);
  });
});
