import { isIP } from "node:net";
import { FetchError, type FetchErrorKind } from "../fetch-error";
import { siteKey } from "../site";
import type { SafeFetch } from "../types";
import { attempt } from "./fetch-attempt";

/** Where one host variant's home page ended up: its final URL, or why there was none. */
export type HostCheck = { url: string; finalUrl: string | null; error: FetchErrorKind | null };

export type HttpsReadiness = {
  productUrlHttps: boolean;
  /** http:// on the product's host ends on https; null when it could not be fetched. */
  httpUpgradesToHttps: boolean | null;
  /** Redirect hops from https to http on any of these checks. */
  downgrades: { from: string; to: string }[];
  /** The product's home page and its apex and www variants (just the home page for an IP). */
  hosts: HostCheck[];
  /** The variants that answered all end on one origin; null when fewer than two answered. */
  hostsConsistent: boolean | null;
  /** Origin the product's home page ends on (its own origin when that failed). */
  siteOrigin: string;
};

// Only where each page ends matters, not its content.
const OPTIONS = { maxBytes: 64 * 1024, accept: "text/html" } as const;

type Fetched = { url: string; chain: string[] } | { url: string; error: FetchErrorKind };

async function follow(fetch: SafeFetch, url: string, signal: AbortSignal): Promise<Fetched> {
  const response = await attempt(() => fetch(url, { ...OPTIONS, signal }), signal);
  if (response instanceof FetchError) return { url, error: response.kind };
  return { url, chain: [...response.redirects, response.finalUrl] };
}

function finalOf(fetched: Fetched): string | null {
  return "chain" in fetched ? (fetched.chain.at(-1) ?? null) : null;
}

function downgradesIn(fetched: Fetched): { from: string; to: string }[] {
  if (!("chain" in fetched)) return [];
  return fetched.chain.flatMap((from, i) => {
    const to = fetched.chain[i + 1];
    return to && from.startsWith("https:") && to.startsWith("http:") ? [{ from, to }] : [];
  });
}

/** The home page, then (for a named host) the https apex and www variants, without repeats. */
function variantsOf(home: URL): string[] {
  if (isIP(home.hostname.replace(/^\[(.*)\]$/, "$1"))) return [home.href];
  const apex = siteKey(home.hostname);
  const port = home.protocol === "https:" && home.port ? `:${home.port}` : "";
  return [...new Set([home.href, `https://${apex}${port}/`, `https://www.${apex}${port}/`])];
}

/** HTTPS use, https→http downgrades and www/apex consistency for a product URL. */
export async function checkHttps(
  fetch: SafeFetch,
  productUrl: string,
  signal: AbortSignal,
): Promise<HttpsReadiness> {
  const home = new URL("/", productUrl);
  // An http product's own home page already shows whether http upgrades.
  const httpUrl = home.protocol === "http:" ? home.href : `http://${home.hostname}/`;
  const urls = variantsOf(home);
  const all = urls.includes(httpUrl) ? urls : [...urls, httpUrl];
  const fetched = await Promise.all(all.map((url) => follow(fetch, url, signal)));
  const byUrl = new Map(fetched.map((f) => [f.url, f]));
  const hosts = urls.flatMap((url) => {
    const f = byUrl.get(url);
    return f ? [{ url, finalUrl: finalOf(f), error: "error" in f ? f.error : null }] : [];
  });
  const answered = hosts.flatMap((h) => (h.finalUrl ? [new URL(h.finalUrl).origin] : []));
  const httpFetched = byUrl.get(httpUrl);
  const httpFinal = httpFetched ? finalOf(httpFetched) : null;
  const homeFinal = hosts[0]?.finalUrl;
  return {
    productUrlHttps: new URL(productUrl).protocol === "https:",
    httpUpgradesToHttps: httpFinal === null ? null : httpFinal.startsWith("https:"),
    downgrades: fetched.flatMap(downgradesIn),
    hosts,
    hostsConsistent: answered.length < 2 ? null : new Set(answered).size === 1,
    siteOrigin: homeFinal ? new URL(homeFinal).origin : home.origin,
  };
}
