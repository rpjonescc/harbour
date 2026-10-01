import { readCappedBody } from "./fetch-body";
import { HostLimiter } from "./host-limiter";
import { resolvePublicHost } from "./public-host";
import { isAllowed, parseRobots, type Robots } from "./robots";
import type { SafeFetch, SafeFetchOptions, SafeFetchResponse } from "./types";

export const HARBOUR_USER_AGENT = "HarbourBot/0.1 (+https://github.com/rpjonescc/harbour)";
const ROBOTS_AGENT = "HarbourBot";
const ROBOTS_MAX_BYTES = 512 * 1024;
const DISALLOW_ALL: Robots = parseRobots("User-agent: *\nDisallow: /\n");

export type FetchErrorKind = "timeout" | "too_large" | "redirect" | "network" | "blocked_by_robots";

/** Why a safe fetch produced no response. */
export class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FetchError";
  }
}

export type SafeFetchSettings = {
  timeoutMs: number;
  maxRedirects: number;
  /** Tests only: lets requests reach 127.0.0.1 / ::1. Private ranges stay refused. */
  allowLoopback: boolean;
  limiter: HostLimiter;
  /** How long a fetched robots.txt is reused for its origin. */
  robotsTtlMs: number;
};

/** The one process-wide limiter, so abandoned collectors still count against a host's limits. */
export const sharedHostLimiter = new HostLimiter({ concurrency: 2, spacingMs: 500 });

const DEFAULTS: SafeFetchSettings = {
  timeoutMs: 15_000,
  maxRedirects: 3,
  allowLoopback: false,
  limiter: sharedHostLimiter,
  robotsTtlMs: 10 * 60_000,
};

type Hop = { status: number; headers: Record<string, string>; ms: number } & (
  | { location: string }
  | { location: null; body: string; truncated: boolean }
);

function parseHttpUrl(raw: string, base?: URL): URL | null {
  if (!URL.canParse(raw, base)) return null;
  const url = new URL(raw, base);
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/** Same site: equal hosts ignoring a leading "www.", or one a subdomain of the other. */
function sameSite(a: URL, b: URL): boolean {
  const x = a.hostname.replace(/^www\./, "");
  const y = b.hostname.replace(/^www\./, "");
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/** Builds a safe fetch; production uses `safeFetch`, tests override the limits. */
export function createSafeFetch(overrides: Partial<SafeFetchSettings> = {}): SafeFetch {
  const settings: SafeFetchSettings = { ...DEFAULTS, ...overrides };
  // Cached per safe fetch instance with a TTL: the production instance lives for the worker's
  // life, so a daily scan re-reads robots.txt while one scan's crawl reads it once per origin.
  const robotsCache = new Map<string, { robots: Promise<Robots>; expiresAt: number }>();

  async function hop(url: URL, options: SafeFetchOptions): Promise<Hop> {
    const isPublic = await resolvePublicHost(url.hostname, settings).catch((error: unknown) => {
      throw new FetchError("network", `Could not resolve ${url.hostname}`, { cause: error });
    });
    if (!isPublic) throw new FetchError("network", `Refused non-public host ${url.hostname}`);
    return settings.limiter.run(url.host, options.signal, () => request(url, options));
  }

  async function request(url: URL, options: SafeFetchOptions): Promise<Hop> {
    const started = performance.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), settings.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout.signal])
      : timeout.signal;
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": HARBOUR_USER_AGENT, accept: options.accept ?? "*/*" },
      });
      const headers = Object.fromEntries(response.headers);
      const location =
        response.status >= 300 && response.status < 400 ? headers.location : undefined;
      if (location) {
        await response.body?.cancel();
        return { status: response.status, headers, location, ms: performance.now() - started };
      }
      const declared = Number(headers["content-length"]);
      if (declared > options.maxBytes) {
        await response.body?.cancel();
        throw new FetchError(
          "too_large",
          `${url} declares ${declared} bytes (cap ${options.maxBytes})`,
        );
      }
      const { text, truncated } = await readCappedBody(response.body, options.maxBytes);
      const ms = performance.now() - started;
      return { status: response.status, headers, location: null, body: text, truncated, ms };
    } catch (error) {
      if (error instanceof FetchError) throw error;
      if (options.signal?.aborted) throw options.signal.reason;
      if (timeout.signal.aborted) {
        throw new FetchError("timeout", `${url} took longer than ${settings.timeoutMs} ms`);
      }
      throw new FetchError("network", `${url} failed: ${String(error)}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadRobots(origin: string, signal: AbortSignal | undefined): Promise<Robots> {
    const response = await follow(`${origin}/robots.txt`, { maxBytes: ROBOTS_MAX_BYTES, signal });
    // Google semantics: a missing file allows everything, a server error disallows everything.
    if (response.status >= 500) return DISALLOW_ALL;
    return parseRobots(response.status < 300 ? response.body : "");
  }

  /** One robots.txt read per origin per TTL, shared by concurrent callers; failures are not cached. */
  function robotsFor(origin: string, signal: AbortSignal | undefined): Promise<Robots> {
    const cached = robotsCache.get(origin);
    if (cached && cached.expiresAt > Date.now()) return cached.robots;
    const robots = loadRobots(origin, signal);
    robotsCache.set(origin, { robots, expiresAt: Date.now() + settings.robotsTtlMs });
    robots.catch(() => robotsCache.delete(origin));
    return robots;
  }

  async function assertRobotsAllow(url: URL, signal: AbortSignal | undefined): Promise<void> {
    const robots = await robotsFor(url.origin, signal);
    if (!isAllowed(robots, ROBOTS_AGENT, url.pathname + url.search)) {
      throw new FetchError("blocked_by_robots", `robots.txt disallows ${url}`);
    }
  }

  async function follow(raw: string, options: SafeFetchOptions): Promise<SafeFetchResponse> {
    options.signal?.throwIfAborted();
    const start = parseHttpUrl(raw);
    if (!start) throw new FetchError("network", `Not an http(s) URL: ${raw}`);
    let current = start;
    let ms = 0;
    for (let hops = 0; hops <= settings.maxRedirects; hops++) {
      if (options.respectRobots) await assertRobotsAllow(current, options.signal);
      const result = await hop(current, options);
      ms += result.ms;
      if (result.location === null) {
        const { status, headers, body, truncated } = result;
        return { url: raw, finalUrl: current.href, status, headers, body, truncated, ms };
      }
      const next = parseHttpUrl(result.location, current);
      if (!next || !sameSite(start, next)) {
        throw new FetchError("redirect", `${current} redirects off-site to ${result.location}`);
      }
      current = next;
    }
    throw new FetchError("redirect", `${raw} redirects more than ${settings.maxRedirects} times`);
  }

  return follow;
}

/** The worker's outbound fetch: production limits and the shared per-host limiter. */
export const safeFetch: SafeFetch = createSafeFetch();
