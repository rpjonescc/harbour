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

/**
 * Git metadata no agent may edit: with .git/config plus .gitattributes an agent could make the
 * worker's own git calls run a command. The agent's working directory is the brain, so these
 * relative deny rules cover it at any depth. Claude Code checks file writes against Edit rules
 * only (a Write path rule is never consulted), so Edit covers Write too.
 */
const GIT_META_DENY = ["Edit(.git)", "Edit(.git/**)", "Edit(.gitattributes)", "Edit(.gitmodules)"];

/** Headless Claude Code invocation with no user settings, plugins, hooks, skills or MCP. */
export function claudeArgs(
  prompt: string,
  model: string,
  tools: readonly string[] = AGENT_TOOLS,
  viaStdin = false,
): string[] {
  const approved = PRE_APPROVED.filter((tool) => tools.includes(tool));
  return [
    "-p",
    // A long prompt, or one holding screen-derived text, goes on stdin: argv is visible to every process.
    ...(viaStdin ? [] : [prompt]),
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--permission-mode",
    "acceptEdits",
    "--tools",
    tools.join(","),
    // Without any web tool there is nothing to pre-approve (and an empty list is not a valid value).
    ...(approved.length > 0 ? ["--allowed-tools", approved.join(",")] : []),
    "--setting-sources",
    "",
    "--settings",
    JSON.stringify({ disableAllHooks: true, permissions: { deny: GIT_META_DENY } }),
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
