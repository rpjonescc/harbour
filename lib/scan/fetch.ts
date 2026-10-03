import { checkedCustomHeaders, isTregHeader, tregHeaders } from "./custom-headers";
import { readCappedBody } from "./fetch-body";
import { FetchError } from "./fetch-error";
import { HostLimiter } from "./host-limiter";
import { sendRequest } from "./http-request";
import { GOOGLE_API_HOSTS, TREG_HOST } from "./outbound-hosts";
import { isNonPublicLiteral, publicLookup, type ResolveHost, resolveWithDns } from "./public-host";
import { createRobotsGate, NO_RULES, robotsForStatus } from "./robots-gate";
import { sameSite, siteKey } from "./site";
import type { SafeFetch, SafeFetchOptions, SafeFetchResponse } from "./types";

export const HARBOUR_USER_AGENT = "HarbourBot/0.1 (+https://github.com/rpjonescc/harbour)";
const ROBOTS_MAX_BYTES = 512 * 1024;

export type SafeFetchSettings = {
  /** The only hostnames requests may go to (start URL and every redirect hop). */
  allowedHosts: ReadonlySet<string>;
  timeoutMs: number;
  maxRedirects: number;
  /** Tests only: lets requests reach 127.0.0.1 / ::1. Private ranges stay refused. */
  allowLoopback: boolean;
  limiter: HostLimiter;
  /**
   * The only hosts that take a POST with custom headers (Treg's). Tests point it at the local
   * fake server; production keeps the default.
   */
  customHeaderHosts: readonly string[];
  /** Resolves hostnames before connecting (tests inject fixed answers). */
  resolveHost: ResolveHost;
  /**
   * Upper bound on reusing a fetched robots.txt for its origin. The worker builds one safe
   * fetch per scan, so in practice the cache also ends with the scan.
   */
  robotsTtlMs: number;
};

/** The one process-wide limiter, so abandoned collectors still count against a site's limits. */
export const sharedHostLimiter = new HostLimiter({ concurrency: 2, spacingMs: 500 });

const DEFAULTS: Omit<SafeFetchSettings, "allowedHosts"> = {
  timeoutMs: 15_000,
  maxRedirects: 3,
  allowLoopback: false,
  customHeaderHosts: [TREG_HOST],
  limiter: sharedHostLimiter,
  resolveHost: resolveWithDns,
  robotsTtlMs: 10 * 60_000,
};

type Hop = Pick<SafeFetchResponse, "status" | "headers" | "headerLines" | "ms"> &
  ({ location: string } | { location: null; body: string; truncated: boolean });

function parseHttpUrl(raw: string, base?: URL): URL | null {
  if (!URL.canParse(raw, base)) return null;
  const url = new URL(raw, base);
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/** Request headers, plus the JSON body and the bearer token or custom headers of a POST. */
function outgoing(options: SafeFetchOptions): { headers: Record<string, string>; body?: string } {
  const headers = { "user-agent": HARBOUR_USER_AGENT, accept: options.accept ?? "*/*" };
  const { post } = options;
  if (!post) return { headers };
  const secret =
    "headers" in post
      ? checkedCustomHeaders(post.headers)
      : { authorization: `Bearer ${post.bearer}` };
  const sent = { ...headers, ...secret, "content-type": "application/json" };
  return { headers: sent, body: JSON.stringify(post.json) };
}

function tooLarge(url: URL, bytes: string, maxBytes: number): FetchError {
  return new FetchError("too_large", `${url} is ${bytes} bytes (cap ${maxBytes})`);
}

/** Builds a safe fetch limited to `allowedHosts`; tests also override the limits. */
export function createSafeFetch(
  overrides: Pick<SafeFetchSettings, "allowedHosts"> & Partial<SafeFetchSettings>,
): SafeFetch {
  const settings: SafeFetchSettings = { ...DEFAULTS, ...overrides };
  const assertRobotsAllow = createRobotsGate(loadRobots, settings.robotsTtlMs);

  const lookup = publicLookup(settings.resolveHost, settings);

  async function hop(url: URL, options: SafeFetchOptions): Promise<Hop> {
    // Names are checked as they connect (publicLookup); Node never looks up an IP literal.
    if (isNonPublicLiteral(url.hostname, settings)) {
      throw new FetchError("network", `Refused non-public host ${url.hostname}`);
    }
    const key = siteKey(url.hostname);
    return settings.limiter.run(key, options.signal, () => request(url, options));
  }

  /** A per-call timeout counts only for Google API and Treg calls (slow by nature). */
  function timeoutFor(url: URL, options: SafeFetchOptions): number {
    const slow =
      GOOGLE_API_HOSTS.includes(url.hostname) || settings.customHeaderHosts.includes(url.hostname);
    return slow && options.timeoutMs !== undefined ? options.timeoutMs : settings.timeoutMs;
  }

  async function request(url: URL, options: SafeFetchOptions): Promise<Hop> {
    const started = performance.now();
    const timeoutMs = timeoutFor(url, options);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error("timeout")), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout.signal])
      : timeout.signal;
    const strict = options.onOverflow === "error";
    try {
      const { headers: sent, body } = outgoing(options);
      const response = await sendRequest(url, sent, signal, lookup, body);
      const { status, headers, headerLines } = response;
      const location = status >= 300 && status < 400 ? headers.location : undefined;
      const ms = () => performance.now() - started;
      if (location) {
        response.body.destroy();
        return { status, headers, headerLines, location, ms: ms() };
      }
      const declared = headers["content-length"] ?? "";
      if (strict && Number(declared) > options.maxBytes) {
        response.body.destroy();
        throw tooLarge(url, declared, options.maxBytes);
      }
      const { text, truncated } = await readCappedBody(response.body, options.maxBytes);
      if (strict && truncated) throw tooLarge(url, `over ${options.maxBytes}`, options.maxBytes);
      return { status, headers, headerLines, location: null, body: text, truncated, ms: ms() };
    } catch (error) {
      if (error instanceof FetchError) throw error;
      if (options.signal?.aborted) throw options.signal.reason;
      if (timeout.signal.aborted) {
        throw new FetchError("timeout", `${url} took longer than ${timeoutMs} ms`);
      }
      throw new FetchError("network", `${url} failed: ${String(error)}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Shared by every caller, so it runs on its own deadline rather than a caller's signal. */
  async function loadRobots(origin: string) {
    const signal = AbortSignal.timeout(settings.timeoutMs * (settings.maxRedirects + 1));
    const url = `${origin}/robots.txt`;
    // Google parses the first ~500 KiB of an oversized file, so truncate rather than fail.
    const options = { maxBytes: ROBOTS_MAX_BYTES, signal, ignoreRobots: true } as const;
    const response = await follow(url, options).catch((error: unknown) => {
      // A robots.txt redirecting off the allowlist (e.g. to a CDN) or too often can't be read;
      // like Google, treat it as unavailable (4xx): no rules. Collectors that fetch robots.txt
      // themselves see the redirect error and report it.
      if (error instanceof FetchError && error.kind === "redirect") return null;
      if (error instanceof FetchError || !signal.aborted) throw error;
      throw new FetchError("timeout", `${url} took too long`, { cause: error });
    });
    return response ? robotsForStatus(response.status, response.body) : NO_RULES;
  }

  function assertAllowedHost(url: URL, kind: "network" | "redirect"): void {
    if (!settings.allowedHosts.has(url.hostname)) {
      throw new FetchError(kind, `${url.hostname} is not an allowed host`);
    }
  }

  /** A bearer POST goes to Google API hosts only; a custom-header POST to Treg's host only. */
  function assertPostAllowed(url: URL, options: SafeFetchOptions): void {
    const { post } = options;
    const host = url.hostname;
    const treg = settings.customHeaderHosts.includes(host);
    if (!post) {
      // Treg's host answers its own collector's POSTs and nothing else.
      if (treg) throw new FetchError("network", `${host} only takes the Treg collector's calls`);
      return;
    }
    if ("headers" in post) {
      if (!treg) throw new FetchError("network", `${host} does not take custom headers`);
      // The key goes to the plain host on the default port only, never to user:pass@ or :port.
      const plain =
        url.username === "" && url.password === "" && (url.port === "" || settings.allowLoopback);
      if (!plain) throw new FetchError("network", `${host} must be called without a port or login`);
      return;
    }
    if (!GOOGLE_API_HOSTS.includes(host)) {
      throw new FetchError("network", `${host} is not a Google API host: only those take a POST`);
    }
  }

  async function follow(raw: string, options: SafeFetchOptions) {
    options.signal?.throwIfAborted();
    const start = parseHttpUrl(raw);
    if (!start) throw new FetchError("network", `Not an http(s) URL: ${raw}`);
    assertAllowedHost(start, "network");
    assertPostAllowed(start, options);
    // The secret never travels in clear text; tests serve plain http on loopback.
    if (options.post && start.protocol !== "https:" && !settings.allowLoopback) {
      throw new FetchError("network", `A POST to ${start.hostname} must use https`);
    }
    let current = start;
    let ms = 0;
    const redirects: string[] = [];
    for (let hops = 0; hops <= settings.maxRedirects; hops++) {
      if (!options.ignoreRobots) await assertRobotsAllow(current, options.signal);
      const result = await hop(current, options);
      ms += result.ms;
      if (result.location === null) {
        const { status, body, truncated } = result;
        // Treg's answers expose only its own headers: the rest is not the collector's business.
        const own = settings.customHeaderHosts.includes(current.hostname);
        const headers = own ? tregHeaders(result.headers) : result.headers;
        const headerLines = own
          ? result.headerLines.filter(([name]) => isTregHeader(name))
          : result.headerLines;
        const finalUrl = current.href;
        return { url: raw, finalUrl, redirects, status, headers, headerLines, body, truncated, ms };
      }
      if (options.post) {
        throw new FetchError("redirect", `${current} redirects a POST to ${result.location}`);
      }
      const next = parseHttpUrl(result.location, current);
      if (!next || !sameSite(start, next)) {
        throw new FetchError("redirect", `${current} redirects off-site to ${result.location}`);
      }
      assertAllowedHost(next, "redirect");
      redirects.push(current.href);
      current = next;
    }
    throw new FetchError("redirect", `${raw} redirects more than ${settings.maxRedirects} times`);
  }

  return follow;
}
