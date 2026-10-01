import { raceAbort } from "./abort";
import { FetchError } from "./fetch-error";
import { isAllowed, parseRobots, type Robots } from "./robots";

const ROBOTS_AGENT = "HarbourBot";
const DISALLOW_ALL: Robots = parseRobots("User-agent: *\nDisallow: /\n");

/** No rules: everything allowed. */
export const NO_RULES: Robots = parseRobots("");

/** robots.txt for a fetched status, with Google's semantics. */
export function robotsForStatus(status: number, body: string): Robots {
  // Rate limiting and server errors mean "don't crawl now"; other 4xx mean "no rules".
  if (status === 429 || status >= 500) return DISALLOW_ALL;
  return status < 300 ? parseRobots(body) : NO_RULES;
}

/**
 * Checks URLs against their origin's robots.txt for HarbourBot. Each origin's file is loaded
 * once per TTL and shared by concurrent callers; the load never uses a caller's signal (one
 * caller giving up must not fail the others), and each caller stops waiting on its own abort.
 * A failed load is not cached.
 */
export function createRobotsGate(load: (origin: string) => Promise<Robots>, ttlMs: number) {
  const cache = new Map<string, { robots: Promise<Robots>; expiresAt: number }>();

  function robotsFor(origin: string): Promise<Robots> {
    const cached = cache.get(origin);
    if (cached && cached.expiresAt > Date.now()) return cached.robots;
    const robots = load(origin);
    cache.set(origin, { robots, expiresAt: Date.now() + ttlMs });
    robots.catch(() => cache.delete(origin));
    return robots;
  }

  /** Throws FetchError "blocked_by_robots" when robots.txt disallows the URL. */
  return async function assertAllowed(url: URL, signal: AbortSignal | undefined): Promise<void> {
    const robots = await raceAbort(robotsFor(url.origin), signal);
    if (!isAllowed(robots, ROBOTS_AGENT, url.pathname + url.search)) {
      throw new FetchError("blocked_by_robots", `robots.txt disallows ${url}`);
    }
  };
}
