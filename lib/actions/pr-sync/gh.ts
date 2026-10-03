import { execFile } from "node:child_process";
import { forTerminal } from "@/lib/text/terminal";
import { parsePullRequestUrl } from "../pr-url";

/** The only pull request fields the sync reads. */
export const PR_FIELDS = "state,isDraft,mergedAt,closedAt,reviewDecision,statusCheckRollup,title";

/** Longest one `gh` call may take before it is stopped. */
export const GH_TIMEOUT_MS = 20_000;

const MAX_OUTPUT = 1024 * 1024;
const MAX_DETAIL = 200;

/**
 * What the child may see: enough to find `gh` and its own login (config dir, keyring session),
 * never a token. GH_TOKEN and GITHUB_TOKEN are left out on purpose so only the existing
 * `gh auth login` is used.
 */
const PASSED_ENV = [
  "PATH",
  "HOME",
  "LANG",
  "XDG_CONFIG_HOME",
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
  "GH_CONFIG_DIR",
] as const;

export type GhFailureKind =
  | "gh_missing"
  | "not_logged_in"
  | "rate_limited"
  | "not_found"
  | "timed_out"
  | "failed";

export type GhResult =
  | { ok: true; stdout: string }
  | { ok: false; kind: GhFailureKind; detail: string };

/** Runs one allowed, read-only `gh` call. */
export type GhRunner = (args: readonly string[]) => Promise<GhResult>;

/** The one `gh` call the sync makes: `gh pr view <url> --json <PR_FIELDS>`. */
export function prViewArgs(url: string): string[] {
  return ["pr", "view", url, "--json", PR_FIELDS];
}

/**
 * True only for exactly `pr view <normalised GitHub pull request URL> --json <PR_FIELDS>`. The
 * runner refuses everything else, so this code cannot merge, close, comment on or edit anything.
 */
export function isAllowedGhCall(args: readonly string[]): boolean {
  if (args.length !== 5) return false;
  const [command, sub, url = "", flag, fields] = args;
  if (command !== "pr" || sub !== "view" || flag !== "--json" || fields !== PR_FIELDS) {
    return false;
  }
  const parsed = parsePullRequestUrl(url);
  return parsed.ok && parsed.url === url;
}

function childEnv(from: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    GH_SPINNER_DISABLED: "1",
    NO_COLOR: "1",
  };
  for (const key of PASSED_ENV) {
    const value = from[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** The first line of gh's complaint, terminal-safe and short. */
function detailOf(stderr: string): string {
  const line = stderr.split("\n").find((l) => l.trim() !== "") ?? "";
  return forTerminal(line.trim()).slice(0, MAX_DETAIL);
}

/** Sorts a failed call by what the owner can do about it. */
export function classifyGhFailure(error: {
  code?: unknown;
  killed?: boolean;
  stderr: string;
}): GhFailureKind {
  if (error.code === "ENOENT") return "gh_missing";
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return "failed";
  if (error.killed) return "timed_out";
  const text = error.stderr.toLowerCase();
  if (text.includes("rate limit")) return "rate_limited";
  if (text.includes("gh auth login") || text.includes("bad credentials")) return "not_logged_in";
  if (text.includes("http 401") || text.includes("not logged")) return "not_logged_in";
  if (text.includes("could not resolve to a") || text.includes("not found")) return "not_found";
  return "failed";
}

/**
 * A runner for the real `gh` (or `bin`), through execFile: no shell, a timeout per call, a small
 * environment. A call outside the allow-list throws before anything runs: it is a bug.
 */
export function ghRunner(
  opts: { bin?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): GhRunner {
  const bin = opts.bin ?? "gh";
  // Cast as in lib/agents/git-command.ts: the project's ProcessEnv type requires NODE_ENV.
  const env = childEnv(opts.env ?? process.env) as NodeJS.ProcessEnv;
  const timeout = opts.timeoutMs ?? GH_TIMEOUT_MS;
  return (args) => {
    if (!isAllowedGhCall(args)) {
      throw new Error(`Refused a gh call outside the read-only allow-list: ${args[0] ?? ""}`);
    }
    return new Promise((resolve) => {
      const options = {
        env,
        timeout,
        maxBuffer: MAX_OUTPUT,
        killSignal: "SIGKILL" as const,
        encoding: "utf8" as const,
      };
      execFile(bin, [...args], options, (error, stdout, stderr) => {
        if (!error) return resolve({ ok: true, stdout });
        const kind = classifyGhFailure({ code: error.code, killed: error.killed, stderr });
        resolve({ ok: false, kind, detail: detailOf(stderr) });
      });
    });
  };
}
