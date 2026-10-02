import { AGENT_TOOLS, agentEnv, claudeArgs } from "./claude-args";

describe("claudeArgs", () => {
  const args = claudeArgs("Do the thing", "sonnet");
  const value = (flag: string) => args[args.indexOf(flag) + 1];

  it("runs headless with streaming JSON and the configured model", () => {
    expect(args.slice(0, 2)).toEqual(["-p", "Do the thing"]);
    expect(value("--output-format")).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(value("--model")).toBe("sonnet");
  });

  it("passes the prompt right after -p and never skips permissions", () => {
    expect(args[args.indexOf("-p") + 1]).toBe("Do the thing");
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("exposes only the research tools, never a shell", () => {
    expect(value("--tools")).toBe("Read,Write,Edit,Glob,Grep,WebSearch,WebFetch");
    expect(AGENT_TOOLS).not.toContain("Bash");
    expect(value("--permission-mode")).toBe("acceptEdits");
  });

  it("pre-approves only web tools, so file access stays inside the working directory", () => {
    // Pre-approving Read/Write/Edit/Glob/Grep would allow them anywhere on disk.
    expect(value("--allowed-tools")).toBe("WebSearch,WebFetch");
  });

  it("loads no user settings, hooks, skills or MCP servers", () => {
    expect(value("--setting-sources")).toBe("");
    expect(JSON.parse(value("--settings") ?? "")).toEqual({ disableAllHooks: true });
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--strict-mcp-config");
    expect(JSON.parse(value("--mcp-config") ?? "")).toEqual({ mcpServers: {} });
    expect(args).toContain("--no-session-persistence");
  });

  it("lets a run narrow its tools, and drops the web pre-approvals it was not given", () => {
    const narrow = claudeArgs("p", "m", ["Write"]);
    expect(narrow[narrow.indexOf("--tools") + 1]).toBe("Write");
    expect(narrow).not.toContain("--allowed-tools");
    const web = claudeArgs("p", "m", ["Write", "WebFetch"]);
    expect(web[web.indexOf("--allowed-tools") + 1]).toBe("WebFetch");
  });
});

describe("agentEnv", () => {
  it("passes only home, path and the token", () => {
    expect(agentEnv("tok", "/home/x", "/usr/bin")).toEqual({
      HOME: "/home/x",
      PATH: "/usr/bin",
      CLAUDE_CODE_OAUTH_TOKEN: "tok",
    });
  });
});
