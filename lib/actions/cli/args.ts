import { parseArgs } from "node:util";
import { parseActionId } from "../action-id";
import type { OwnerChange } from "../transitions";
import { ACTION_STATUSES, type ActionStatus } from "../types";

/** A mistake in how the command was typed: shown with the usage, never as a stack trace. */
export class CliUsageError extends Error {}

/** Longest reason Claude may give for a status change. */
export const MAX_NOTE = 1000;

export type CliCommand =
  | { name: "help" }
  | { name: "list"; productId: string | null; statuses: ActionStatus[] | null; json: boolean }
  | { name: "show"; id: number }
  | { name: "set"; id: number; from: ActionStatus; change: OwnerChange & { note: string } }
  | { name: "link"; id: number; url: string | null };

export const USAGE = `Usage:
  pnpm actions list [--product <id>] [--status <s>[,<s>]] [--json]
  pnpm actions show <id>
  pnpm actions set <id> <status> --from <status> --note "<reason>" [--until YYYY-MM-DD]
  pnpm actions link <id> <github-pr-url>
  pnpm actions link <id> --clear

Statuses: ${ACTION_STATUSES.join(", ")}`;

const OPTIONS = {
  product: { type: "string" },
  status: { type: "string" },
  json: { type: "boolean" },
  from: { type: "string" },
  note: { type: "string" },
  until: { type: "string" },
  clear: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

type Values = {
  product?: string;
  status?: string;
  json?: boolean;
  from?: string;
  note?: string;
  until?: string;
  clear?: boolean;
  help?: boolean;
};

/** Which options each command accepts; anything else is a usage error. */
const ALLOWED: Record<Exclude<CliCommand["name"], "help">, readonly (keyof Values)[]> = {
  list: ["product", "status", "json"],
  show: [],
  set: ["from", "note", "until"],
  link: ["clear"],
};

function tokens(argv: readonly string[]): { positionals: string[]; values: Values } {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    // node:util reports typing mistakes as ERR_PARSE_ARGS_* errors; anything else is a bug.
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (error instanceof Error && code.startsWith("ERR_PARSE_ARGS")) {
      throw new CliUsageError(error.message);
    }
    throw error;
  }
}

function status(raw: string): ActionStatus {
  const found = ACTION_STATUSES.find((s) => s === raw);
  if (!found) throw new CliUsageError(`Unknown status: ${raw}`);
  return found;
}

function actionId(raw: string | undefined, usage: string): number {
  if (raw === undefined) throw new CliUsageError(usage);
  const id = parseActionId(raw);
  if (id === null) throw new CliUsageError(`Not an action id: ${raw}`);
  return id;
}

function parseList(args: string[], values: Values): CliCommand {
  if (args.length > 0) throw new CliUsageError("list takes no arguments, only options");
  const statuses = values.status === undefined ? null : values.status.split(",").map(status);
  return { name: "list", productId: values.product ?? null, statuses, json: values.json ?? false };
}

function parseNote(raw: string | undefined): string {
  const note = raw?.trim() ?? "";
  if (note === "")
    throw new CliUsageError('--note is required: say why, e.g. --note "Fixed in #42"');
  if (note.length > MAX_NOTE)
    throw new CliUsageError(`--note must be at most ${MAX_NOTE} characters`);
  return note;
}

function parseUntil(to: OwnerChange["to"], until: string | undefined): { until?: string } {
  if (until === undefined) return {};
  if (to !== "snoozed") throw new CliUsageError("--until is only for snoozed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new CliUsageError("--until must be YYYY-MM-DD");
  return { until };
}

function parseSet(args: string[], values: Values): CliCommand {
  const usage = 'Usage: pnpm actions set <id> <status> --from <status> --note "<reason>"';
  const [rawId, rawTo, ...rest] = args;
  const id = actionId(rawId, usage);
  if (rawTo === undefined || rest.length > 0) throw new CliUsageError(usage);
  const to = status(rawTo);
  if (to === "suggested") throw new CliUsageError(`Unknown target status: ${to}`);
  if (values.from === undefined)
    throw new CliUsageError("--from is required: the status you last saw");
  const from = status(values.from);
  const note = parseNote(values.note);
  return { name: "set", id, from, change: { to, note, ...parseUntil(to, values.until) } };
}

function parseLink(args: string[], values: Values): CliCommand {
  const usage = "Usage: pnpm actions link <id> <github-pr-url> | pnpm actions link <id> --clear";
  const [rawId, url, ...rest] = args;
  const id = actionId(rawId, usage);
  const clear = values.clear ?? false;
  if (rest.length > 0 || clear === (url !== undefined)) throw new CliUsageError(usage);
  return { name: "link", id, url: url ?? null };
}

function rejectForeignOptions(name: keyof typeof ALLOWED, values: Values): void {
  for (const key of Object.keys(values) as (keyof Values)[]) {
    if (!ALLOWED[name].includes(key))
      throw new CliUsageError(`--${key} is not an option of ${name}`);
  }
}

/** Reads `pnpm actions` arguments into a command; throws CliUsageError for a typing mistake. */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  const { positionals, values } = tokens(argv);
  const [name, ...args] = positionals;
  if (name === undefined || name === "help" || values.help) return { name: "help" };
  if (name === "show") {
    rejectForeignOptions(name, values);
    const usage = "Usage: pnpm actions show <id>";
    if (args.length > 1) throw new CliUsageError(usage);
    return { name: "show", id: actionId(args[0], usage) };
  }
  const parsers = { list: parseList, set: parseSet, link: parseLink } as const;
  if (!(name in parsers)) throw new CliUsageError(`Unknown command: ${name}`);
  const command = name as keyof typeof parsers;
  rejectForeignOptions(command, values);
  return parsers[command](args, values);
}
