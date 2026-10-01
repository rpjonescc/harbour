/** robots.txt parsing and matching with Google's semantics (RFC 9309). */

export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };
export type Robots = { groups: RobotsGroup[]; sitemaps: string[] };

export type CrawlerAccess = "allowed" | "blocked" | "partial";

/** The AI crawlers whose access the readiness checks report. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Google-Extended",
  "CCBot",
  "Bytespider",
] as const;

export type AiCrawler = (typeof AI_CRAWLERS)[number];

/** "HarbourBot/0.1" and "harbourbot" name the same crawler. */
function agentToken(agent: string): string {
  return (agent.split("/")[0] ?? "").trim().toLowerCase();
}

function splitLine(line: string): { key: string; value: string } | null {
  const hash = line.indexOf("#");
  const content = hash === -1 ? line : line.slice(0, hash);
  const colon = content.indexOf(":");
  if (colon === -1) return null;
  return {
    key: content.slice(0, colon).trim().toLowerCase(),
    value: content.slice(colon + 1).trim(),
  };
}

/** Parses robots.txt into user-agent groups and sitemap URLs; unknown lines are ignored. */
export function parseRobots(text: string): Robots {
  const robots: Robots = { groups: [], sitemaps: [] };
  let group: RobotsGroup | null = null;
  for (const line of text.split(/\r?\n|\r/)) {
    const field = splitLine(line);
    if (!field) continue;
    const { key, value } = field;
    if (key === "sitemap") {
      if (value) robots.sitemaps.push(value);
    } else if (key === "user-agent") {
      // A user-agent after rules starts a new group; consecutive ones share a group.
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        robots.groups.push(group);
      }
      if (value) group.agents.push(agentToken(value));
    } else if ((key === "allow" || key === "disallow") && group && value) {
      group.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  return robots;
}

/** Rules of every group naming this agent, or of the * groups when none does. */
function rulesFor(robots: Robots, agent: string): RobotsRule[] {
  const token = agentToken(agent);
  const named = robots.groups.filter((group) => group.agents.includes(token));
  const groups = named.length > 0 ? named : robots.groups.filter((g) => g.agents.includes("*"));
  return groups.flatMap((group) => group.rules);
}

/**
 * Glob match where `*` is any run of characters: two pointers that backtrack only to the last
 * `*`, so the cost is O(pattern × path) — a regex here backtracks exponentially.
 */
function globMatches(pattern: string, path: string): boolean {
  let p = 0;
  let s = 0;
  let star = -1;
  let resume = 0;
  while (s < path.length) {
    if (pattern[p] === "*") {
      star = p++;
      resume = s;
    } else if (p < pattern.length && pattern[p] === path[s]) {
      p++;
      s++;
    } else if (star !== -1) {
      p = star + 1;
      s = ++resume;
    } else {
      return false;
    }
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}

/** Rules match a path prefix unless they end with the `$` anchor. */
function patternMatches(pattern: string, path: string): boolean {
  if (pattern.endsWith("$")) return globMatches(pattern.slice(0, -1), path);
  return globMatches(`${pattern}*`, path);
}

function allowedBy(rules: readonly RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    const longer = !best || rule.pattern.length > best.pattern.length;
    const tieWonByAllow = best && rule.pattern.length === best.pattern.length && rule.allow;
    if (longer || tieWonByAllow) best = rule;
  }
  return best?.allow ?? true;
}

/** Whether `agent` may fetch `path` (path plus query): the longest matching rule wins, allow on a tie. */
export function isAllowed(robots: Robots, agent: string, path: string): boolean {
  if (path === "/robots.txt") return true;
  return allowedBy(rulesFor(robots, agent), path);
}

/** A crawler's access to the site root: blocked, allowed, or allowed with some paths disallowed. */
export function crawlerAccess(robots: Robots, agent: string): CrawlerAccess {
  const rules = rulesFor(robots, agent);
  if (!allowedBy(rules, "/")) return "blocked";
  return rules.some((rule) => !rule.allow) ? "partial" : "allowed";
}

/** Each AI crawler's access to the site root (see `crawlerAccess`). */
export function aiCrawlerAccess(robots: Robots): Record<AiCrawler, CrawlerAccess> {
  const entries = AI_CRAWLERS.map((crawler): [AiCrawler, CrawlerAccess] => [
    crawler,
    crawlerAccess(robots, crawler),
  ]);
  return Object.fromEntries(entries) as Record<AiCrawler, CrawlerAccess>;
}
