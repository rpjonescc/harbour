import { FetchError, type FetchErrorKind } from "../fetch-error";
import type { SafeFetch } from "../types";
import { checkHttps } from "./readiness-https";

/** Where a URL ends: the redirects on the way (each a URL), then the final URL. */
type Route = string[] | FetchErrorKind;

/** A fake fetch that answers each URL by its route and records what was asked. */
function routes(table: Record<string, Route>) {
  const asked: string[] = [];
  const fetch: SafeFetch = async (url) => {
    asked.push(url);
    const route = table[url];
    if (route === undefined) throw new Error(`unexpected request ${url}`);
    if (typeof route === "string") throw new FetchError(route, `${url} failed`);
    const finalUrl = route.at(-1) ?? url;
    const redirects = [url, ...route.slice(0, -1)].filter((u) => u !== finalUrl);
    const base = { url, finalUrl, redirects, status: 200, headers: {}, headerLines: [] };
    return { ...base, body: "", truncated: false, ms: 1 };
  };
  return { fetch, asked };
}

const signal = new AbortController().signal;

describe("checkHttps", () => {
  it("passes a site that upgrades to https and settles on one host", async () => {
    const { fetch } = routes({
      "https://example.com/": ["https://www.example.com/"],
      "https://www.example.com/": ["https://www.example.com/"],
      "http://example.com/": ["https://example.com/", "https://www.example.com/"],
    });
    const result = await checkHttps(fetch, "https://example.com/docs", signal);
    expect(result).toEqual({
      productUrlHttps: true,
      httpUpgradesToHttps: true,
      downgrades: [],
      hosts: [
        { url: "https://example.com/", finalUrl: "https://www.example.com/", error: null },
        { url: "https://www.example.com/", finalUrl: "https://www.example.com/", error: null },
      ],
      hostsConsistent: true,
      siteOrigin: "https://www.example.com",
    });
  });

  it("records an https→http downgrade anywhere in a redirect chain", async () => {
    const { fetch } = routes({
      "https://example.com/": ["http://example.com/landing", "https://example.com/home"],
      "https://www.example.com/": ["http://www.example.com/"],
      "http://example.com/": ["https://example.com/home"],
    });
    const result = await checkHttps(fetch, "https://example.com/", signal);
    expect(result.downgrades).toEqual([
      { from: "https://example.com/", to: "http://example.com/landing" },
      { from: "https://www.example.com/", to: "http://www.example.com/" },
    ]);
    expect(result.hostsConsistent).toBe(false);
  });

  it("reports an http site that stays on http", async () => {
    const { fetch, asked } = routes({
      "http://example.com/": ["http://example.com/"],
      "https://example.com/": "network",
      "https://www.example.com/": "network",
    });
    const result = await checkHttps(fetch, "http://example.com/", signal);
    expect(result).toMatchObject({
      productUrlHttps: false,
      httpUpgradesToHttps: false,
      hostsConsistent: null,
      siteOrigin: "http://example.com",
    });
    expect(asked.filter((u) => u === "http://example.com/")).toHaveLength(1);
  });

  it("leaves consistency unknown when only one host answers (a subdomain without www)", async () => {
    const { fetch } = routes({
      "https://docs.example.com/": ["https://docs.example.com/"],
      "https://www.docs.example.com/": "network",
      "http://docs.example.com/": "timeout",
    });
    const result = await checkHttps(fetch, "https://docs.example.com/", signal);
    expect(result).toMatchObject({
      httpUpgradesToHttps: null,
      hostsConsistent: null,
      hosts: [
        { url: "https://docs.example.com/", finalUrl: "https://docs.example.com/", error: null },
        { url: "https://www.docs.example.com/", finalUrl: null, error: "network" },
      ],
    });
  });

  it("checks only the product's own host when it is an IP address", async () => {
    const { fetch, asked } = routes({ "http://127.0.0.1:8080/": ["http://127.0.0.1:8080/"] });
    const result = await checkHttps(fetch, "http://127.0.0.1:8080/", signal);
    expect(asked).toEqual(["http://127.0.0.1:8080/"]);
    expect(result).toMatchObject({
      hosts: [{ url: "http://127.0.0.1:8080/", finalUrl: "http://127.0.0.1:8080/", error: null }],
      hostsConsistent: null,
      siteOrigin: "http://127.0.0.1:8080",
    });
  });
});
