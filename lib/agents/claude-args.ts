/** The only tools an agent gets: research and brain file editing. Never a shell. */
export const AGENT_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
] as const;

// Only web tools are pre-approved. File tools are deliberately NOT listed: in acceptEdits mode
// Claude Code then allows them inside the working directory (the brain) and denies them
// everywhere else. Listing them here would pre-approve them for the whole machine.
const PRE_APPROVED = ["WebSearch", "WebFetch"] as const;

/** Headless Claude Code invocation with no user settings, plugins, hooks, skills or MCP. */
export function claudeArgs(prompt: string, model: string): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--permission-mode",
    "acceptEdits",
    "--tools",
    AGENT_TOOLS.join(","),
    "--allowed-tools",
    PRE_APPROVED.join(","),
    "--setting-sources",
    "",
    "--settings",
    JSON.stringify({ disableAllHooks: true }),
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify({ mcpServers: {} }),
    "--no-session-persistence",
  ];
}

/** Minimal environment: nothing from the worker's own environment leaks to the agent. */
export function agentEnv(token: string, home: string, path: string): Record<string, string> {
  return { HOME: home, PATH: path, CLAUDE_CODE_OAUTH_TOKEN: token };
}
