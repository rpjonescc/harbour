import type { Db } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import { MOVE_REFUSAL, type MoveRefusal } from "../move-refusal";
import { moveToColumn } from "../move-to-column";
import { addNote } from "../note";
import { linkPullRequest } from "../pr-link";
import { applyStatusChange } from "../status-change";
import { actionHistory } from "../store";
import { MAX_SNOOZE_DAYS } from "../transitions";
import { ACTION_STATUSES, type ActionStatus } from "../types";
import { addAction } from "./add";
import { type CliCommand, CliUsageError, parseCliArgs, USAGE } from "./args";
import { DATA_NOTE, jsonRow, listLine, showText } from "./format";
import { findAction, listActions } from "./queries";

export type CliDeps = {
  db: Db;
  products: readonly Pick<Product, "id" | "name" | "url">[];
  /** HARBOUR_TIMEZONE, for "today" in snooze checks. */
  timeZone: string;
  now: Date;
};

export type CliOutput = { code: number; stdout: string; stderr: string };

/** An expected failure (not found, refused): its message is the whole story, no stack. */
class CliError extends Error {}

/** What `list` shows without --status: everything still waiting on someone. */
const WAITING: readonly ActionStatus[] = ACTION_STATUSES.filter(
  (s) => s !== "done" && s !== "dismissed",
);

const PR_HINT = "expected https://github.com/<owner>/<repo>/pull/<number>";

function productIds(deps: CliDeps): string[] {
  return deps.products.map((p) => p.id);
}

function list(deps: CliDeps, cmd: Extract<CliCommand, { name: "list" }>): CliOutput {
  const ids = productIds(deps);
  if (cmd.productId !== null && !ids.includes(cmd.productId)) {
    throw new CliError(`Unknown product: ${cmd.productId} (configured: ${ids.join(", ")})`);
  }
  const products = cmd.productId === null ? ids : [cmd.productId];
  const where =
    cmd.columns === null ? { statuses: cmd.statuses ?? WAITING } : { columns: cmd.columns };
  const { rows, total } = listActions(deps.db, products, where);
  const more = total - rows.length;
  const narrow = cmd.columns === null ? "--status" : "--column";
  const stderr = more > 0 ? `${more} more not shown: narrow with --product or ${narrow}\n` : "";
  if (cmd.json) {
    const printed = { note: DATA_NOTE, actions: rows.map(jsonRow) };
    return { code: 0, stdout: `${JSON.stringify(printed, null, 2)}\n`, stderr };
  }
  const lines = rows.length === 0 ? ["No matching actions."] : [DATA_NOTE, ...rows.map(listLine)];
  return { code: 0, stdout: `${lines.join("\n")}\n`, stderr };
}

function shown(deps: CliDeps, id: number): string {
  const row = findAction(deps.db, id, productIds(deps));
  const product = deps.products.find((p) => p.id === row?.productId);
  if (!row || !product) throw new CliError(`Action #${id} not found`);
  return showText(row, product, actionHistory(deps.db, id));
}

function show(deps: CliDeps, id: number): CliOutput {
  return { code: 0, stdout: `${shown(deps, id)}\n`, stderr: "" };
}

function refusal(cmd: Extract<CliCommand, { name: "set" }>, error: string, today: string): string {
  const { id, from, change } = cmd;
  switch (error) {
    case "not_found":
      return `Action #${id} not found`;
    case "stale":
      return `Action #${id} is no longer ${from}: run "pnpm actions show ${id}" and decide again`;
    case "not_allowed":
      return `Cannot move action #${id} from ${from} to ${change.to}`;
    case "note_required":
      return '--note is required: say why, e.g. --note "Fixed in #42"';
    case "until_required":
      return "Snoozing needs --until YYYY-MM-DD";
    case "until_invalid":
      return `--until must be a real YYYY-MM-DD date after today (${today}) and at most ${MAX_SNOOZE_DAYS} days ahead`;
    default:
      return `Action #${id} changed while saving: try again`;
  }
}

function set(deps: CliDeps, cmd: Extract<CliCommand, { name: "set" }>): CliOutput {
  const today = isoDateIn(deps.timeZone, deps.now);
  const result = applyStatusChange(deps.db, {
    id: cmd.id,
    from: cmd.from,
    change: cmd.change,
    actor: "claude",
    login: "claude",
    productIds: productIds(deps),
    today,
    now: deps.now,
  });
  if (!result.ok) throw new CliError(refusal(cmd, result.error, today));
  const until = result.snoozedUntil === null ? "" : ` until ${result.snoozedUntil}`;
  return { code: 0, stdout: `#${cmd.id} ${cmd.from} → ${result.status}${until}\n`, stderr: "" };
}

function moveRefusal(cmd: Extract<CliCommand, { name: "move" }>, reason: MoveRefusal): string {
  switch (reason) {
    case "not_found":
      return `Action #${cmd.id} not found`;
    case "stale":
      return `Action #${cmd.id} is no longer in ${cmd.from}: run "pnpm actions show ${cmd.id}" and decide again`;
    default:
      return MOVE_REFUSAL[reason];
  }
}

function move(deps: CliDeps, cmd: Extract<CliCommand, { name: "move" }>): CliOutput {
  const result = moveToColumn(deps.db, {
    id: cmd.id,
    from: cmd.from,
    to: cmd.to,
    actor: "claude",
    note: cmd.note,
    login: "claude",
    productIds: productIds(deps),
    now: deps.now,
  });
  if (!result.ok) throw new CliError(moveRefusal(cmd, result.reason));
  return { code: 0, stdout: `#${cmd.id} ${cmd.from} → ${cmd.to}\n`, stderr: "" };
}

function link(deps: CliDeps, cmd: Extract<CliCommand, { name: "link" }>): CliOutput {
  const result = linkPullRequest(deps.db, {
    id: cmd.id,
    url: cmd.url,
    productIds: productIds(deps),
    now: deps.now,
  });
  if (!result.ok && result.error === "invalid_url") {
    throw new CliError(`Not a GitHub pull request URL: ${PR_HINT}`);
  }
  if (!result.ok) throw new CliError(`Action #${cmd.id} not found`);
  const done = result.prUrl === null ? "pull request link cleared" : `linked to ${result.prUrl}`;
  return { code: 0, stdout: `#${cmd.id} ${done}\n`, stderr: "" };
}

function note(deps: CliDeps, cmd: Extract<CliCommand, { name: "note" }>): CliOutput {
  const result = addNote(deps.db, {
    id: cmd.id,
    note: cmd.note,
    productIds: productIds(deps),
    now: deps.now,
  });
  if (!result.ok) throw new CliError(`Action #${cmd.id} not found`);
  return { code: 0, stdout: `#${cmd.id} note added; the card stays where it is\n`, stderr: "" };
}

function add(deps: CliDeps, cmd: Extract<CliCommand, { name: "add" }>): CliOutput {
  const ids = productIds(deps);
  if (!ids.includes(cmd.input.productId)) {
    throw new CliError(`Unknown product: ${cmd.input.productId} (configured: ${ids.join(", ")})`);
  }
  const result = addAction(deps.db, cmd.input, deps.now);
  if (!result.ok) {
    throw new CliError(
      `Action #${result.duplicateOf} already has this title for ${cmd.input.productId}: run "pnpm actions show ${result.duplicateOf}"`,
    );
  }
  return {
    code: 0,
    stdout: `Created action #${result.id}\n\n${shown(deps, result.id)}\n`,
    stderr: "",
  };
}

function dispatch(deps: CliDeps, cmd: CliCommand): CliOutput {
  switch (cmd.name) {
    case "help":
      return { code: 0, stdout: `${USAGE}\n`, stderr: "" };
    case "list":
      return list(deps, cmd);
    case "show":
      return show(deps, cmd.id);
    case "set":
      return set(deps, cmd);
    case "move":
      return move(deps, cmd);
    case "link":
      return link(deps, cmd);
    case "note":
      return note(deps, cmd);
    case "add":
      return add(deps, cmd);
  }
}

/**
 * Runs one `pnpm actions` command as Claude. Expected failures come back as a message and a
 * non-zero code (2 for a usage mistake); anything else is a bug and is thrown.
 */
export function runActionsCli(argv: readonly string[], deps: CliDeps): CliOutput {
  try {
    return dispatch(deps, parseCliArgs(argv));
  } catch (error) {
    if (error instanceof CliUsageError) {
      return { code: 2, stdout: "", stderr: `${error.message}\n\n${USAGE}\n` };
    }
    if (error instanceof CliError) return { code: 1, stdout: "", stderr: `${error.message}\n` };
    throw error;
  }
}
