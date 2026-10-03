import {
  AI_CRAWLERS,
  AI_RETRIEVAL_AGENTS,
  AI_TRAINING_CRAWLERS,
  aiCrawlerAccess,
  crawlerAccess,
  isAllowed,
  parseRobots,
} from "./robots";

describe("parseRobots", () => {
  it("groups consecutive user-agents, ignores comments and collects sitemaps anywhere", () => {
    const robots = parseRobots(
      [
        "# Acme Docs",
        "User-agent: GPTBot",
        "User-agent: CCBot  # trailing comment",
        "Disallow: /",
        "",
        "Sitemap: https://example.com/sitemap.xml",
        "User-agent: *",
        "Allow: /docs",
        "Disallow: /private",
        "Crawl-delay: 5",
        "sitemap: https://example.com/news.xml",
      ].join("\r\n"),
    );
    expect(robots.groups).toEqual([
      { agents: ["gptbot", "ccbot"], rules: [{ allow: false, pattern: "/" }] },
      {
        agents: ["*"],
        rules: [
          { allow: true, pattern: "/docs" },
          { allow: false, pattern: "/private" },
        ],
      },
    ]);
    expect(robots.sitemaps).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/news.xml",
    ]);
  });

  it("drops rules that appear before any user-agent and empty disallows", () => {
    const robots = parseRobots("Disallow: /orphan\nUser-agent: *\nDisallow:\n");
    expect(robots.groups).toEqual([{ agents: ["*"], rules: [] }]);
  });
});

describe("isAllowed", () => {
  it("allows everything when there is no matching group", () => {
    const robots = parseRobots("User-agent: GPTBot\nDisallow: /\n");
    expect(isAllowed(robots, "HarbourBot", "/anything")).toBe(true);
  });

  it("treats an empty disallow as allow-all", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "HarbourBot", "/x")).toBe(true);
  });

  it("matches agents case-insensitively and ignores product versions", () => {
    const robots = parseRobots("User-agent: harbourbot/0.1\nDisallow: /\n");
    expect(isAllowed(robots, "HarbourBot", "/page")).toBe(false);
  });

  it("prefers the named group over * and merges repeated groups for one agent", () => {
    const robots = parseRobots(
      [
        "User-agent: *",
        "Disallow: /",
        "User-agent: HarbourBot",
        "Disallow: /a",
        "User-agent: HarbourBot",
        "Disallow: /b",
      ].join("\n"),
    );
    expect(isAllowed(robots, "HarbourBot", "/c")).toBe(true);
    expect(isAllowed(robots, "HarbourBot", "/a/1")).toBe(false);
    expect(isAllowed(robots, "HarbourBot", "/b/1")).toBe(false);
    expect(isAllowed(robots, "OtherBot", "/c")).toBe(false);
  });

  it("uses the longest matching rule, with allow winning a tie", () => {
    const robots = parseRobots(
      "User-agent: *\nDisallow: /docs\nAllow: /docs/public\nAllow: /tie\nDisallow: /tie\n",
    );
    expect(isAllowed(robots, "HarbourBot", "/docs/secret")).toBe(false);
    expect(isAllowed(robots, "HarbourBot", "/docs/public/page")).toBe(true);
    expect(isAllowed(robots, "HarbourBot", "/tie")).toBe(true);
  });

  it("supports * wildcards and the $ end anchor", () => {
    const robots = parseRobots(
      "User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*q=\nDisallow: /exact$\n",
    );
    expect(isAllowed(robots, "HarbourBot", "/files/guide.pdf")).toBe(false);
    expect(isAllowed(robots, "HarbourBot", "/files/guide.pdf?download=1")).toBe(true);
    expect(isAllowed(robots, "HarbourBot", "/search/results?q=acme")).toBe(false);
    expect(isAllowed(robots, "HarbourBot", "/exact")).toBe(false);
    expect(isAllowed(robots, "HarbourBot", "/exact/more")).toBe(true);
  });

  it("treats regex metacharacters in patterns literally", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /a.b(c)\n");
    expect(isAllowed(robots, "HarbourBot", "/a.b(c)/d")).toBe(false);
    expect(isAllowed(robots, "HarbourBot", "/axb(c)/d")).toBe(true);
  });

  it("matches many wildcards against a long path in linear time", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /*a*a*a*a*a*a*a*a*a*a*a*a*b\n");
    const started = performance.now();
    expect(isAllowed(robots, "HarbourBot", `/${"a".repeat(60)}`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("always allows /robots.txt itself", () => {
    expect(
      isAllowed(parseRobots("User-agent: *\nDisallow: /\n"), "HarbourBot", "/robots.txt"),
    ).toBe(true);
  });
});

describe("aiCrawlerAccess", () => {
  it("reports allowed, blocked or partial for each AI crawler", () => {
    const robots = parseRobots(
      [
        "User-agent: GPTBot",
        "User-agent: ccbot",
        "Disallow: /",
        "",
        "User-agent: ClaudeBot",
        "Disallow: /private",
        "",
        "User-agent: PerplexityBot",
        "Disallow: /",
        "Allow: /$",
        "",
        "User-agent: Google-Extended",
        "Allow: /",
      ].join("\n"),
    );
    expect(aiCrawlerAccess(robots)).toEqual({
      GPTBot: "blocked",
      "OAI-SearchBot": "allowed",
      "ChatGPT-User": "allowed",
      PerplexityBot: "partial",
      ClaudeBot: "partial",
      "Claude-SearchBot": "allowed",
      "Google-Extended": "allowed",
      CCBot: "blocked",
      Bytespider: "allowed",
    });
  });

  it("falls back to the * group for crawlers without their own group", () => {
    const access = aiCrawlerAccess(parseRobots("User-agent: *\nDisallow: /\n"));
    expect(Object.values(access).every((value) => value === "blocked")).toBe(true);
  });
});

describe("crawlerAccess", () => {
  it.each([
    ["User-agent: *\nDisallow: /drafts/\n", "partial"],
    ["User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\n", "blocked"],
    ["User-agent: *\nDisallow: /\n\nUser-agent: googlebot\nAllow: /\n", "allowed"],
    ["", "allowed"],
  ])("reads Googlebot's access to / from %j as %s", (text, expected) => {
    expect(crawlerAccess(parseRobots(text), "Googlebot")).toBe(expected);
  });
});

describe("AI crawler classes", () => {
  it("puts every AI crawler in exactly one class: answering questions or training", () => {
    for (const crawler of AI_CRAWLERS) {
      expect(AI_RETRIEVAL_AGENTS.has(crawler) !== AI_TRAINING_CRAWLERS.has(crawler)).toBe(true);
    }
  });

  it("treats the training-data crawlers as training only", () => {
    expect([...AI_TRAINING_CRAWLERS].sort()).toEqual([
      "Bytespider",
      "CCBot",
      "ClaudeBot",
      "GPTBot",
      "Google-Extended",
    ]);
  });
});
