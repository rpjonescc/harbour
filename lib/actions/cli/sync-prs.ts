import { parseArgs } from "node:util";
import { COLUMN_COPY } from "@/lib/explain/board";
import { SYNC_FAILURE, SYNC_HELD } from "@/lib/explain/pr-sync";
import { cleanStrings, forTerminal as t } from "@/lib/text/terminal";
import type { GhRunner } from "../pr-sync/gh";
import { syncPullRequests } from "../pr-sync/sync";
import type { CardOutcome, SyncReport } from "../pr-sync/types";
import { DATA_NOTE } from "./format";
import type { CliDeps, CliOutput } from "./run";
import { CliUsageError } from "./usage-error";

export type SyncCliDeps = CliDeps & { locale: string; gh: GhRunner };

const SYNC_USAGE = "Usage: pnpm actions sync-prs [--dry-run] [--json]";

function parseSyncArgs(argv: readonly string[]): { dryRun: boolean; json: boolean } {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: { "dry-run": { type: "boolean" }, json: { type: "boolean" } },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length > 0)
      throw new CliUsageError("sync-prs takes no arguments, only options");
    return { dryRun: values["dry-run"] ?? false, json: values.json ?? false };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (error instanceof Error && code.startsWith("ERR_PARSE_ARGS")) {
      throw new CliUsageError(error.message);
    }
    throw error;
  }
}

const name = (column: keyof typeof COLUMN_COPY) => COLUMN_COPY[column].name;
const label = (o: CardOutcome) => `#${o.id} "${t(o.title)}"`;

function outcomeLine(o: CardOutcome, dryRun: boolean): string | null {
  switch (o.result) {
    case "moved":
      return `${dryRun ? "Would move" : "Moved"} ${label(o)} from ${name(o.from)} to ${name(o.to)}: ${o.notes.join(" ")}`;
    case "noted":
      return `${dryRun ? "Would note on" : "Noted on"} ${label(o)}: ${o.notes.join(" ")}`;
    case "held": {
      const wants = o.wanted === null ? "" : ` Its pull request says ${name(o.wanted)}.`;
      return `Left for a decision ${label(o)}: ${SYNC_HELD[o.reason]}${wants}`;
    }
    case "failed": {
      const detail = o.detail === "" ? "" : ` (${o.detail})`;
      return `Could not check ${label(o)}: ${SYNC_FAILURE[o.reason]}${detail}`;
    }
    case "unchanged":
      return null;
  }
}

/** The plain summary: what moved, what failed, what changed nothing. */
export function syncSummary(report: SyncReport): string {
  const { outcomes, dryRun, more } = report;
  if (outcomes.length === 0) return "No cards with a pull request to check.\n";
  const head = `Checked ${outcomes.length} ${outcomes.length === 1 ? "card" : "cards"} with a pull request${dryRun ? " (dry run: nothing was changed)" : ""}.`;
  const lines = outcomes.map((o) => outcomeLine(o, dryRun)).filter((l) => l !== null);
  const unchanged = outcomes.filter((o) => o.result === "unchanged").map((o) => `#${o.id}`);
  const tail = [
    ...(unchanged.length > 0 ? [`No change: ${unchanged.join(", ")}.`] : []),
    ...(more > 0 ? [`${more} more with a pull request wait for the next run.`] : []),
  ];
  return `${[head, ...lines, ...tail].join("\n")}\n`;
}

function syncJson(report: SyncReport): string {
  const failed = report.outcomes.filter((o) => o.result === "failed").length;
  const { outcomes, ...rest } = report;
  const printed = { note: DATA_NOTE, ...rest, failed, cards: outcomes };
  return `${JSON.stringify(cleanStrings(printed), null, 2)}\n`;
}

/** `pnpm actions sync-prs`: exit 1 when any card could not be checked or moved, 2 for a typo. */
export async function runSyncPrsCli(
  argv: readonly string[],
  deps: SyncCliDeps,
): Promise<CliOutput> {
  let opts: { dryRun: boolean; json: boolean };
  try {
    opts = parseSyncArgs(argv);
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    return { code: 2, stdout: "", stderr: `${error.message}\n\n${SYNC_USAGE}\n` };
  }
  const report = await syncPullRequests({
    db: deps.db,
    productIds: deps.products.map((p) => p.id),
    gh: deps.gh,
    now: deps.now,
    timeZone: deps.timeZone,
    locale: deps.locale,
    dryRun: opts.dryRun,
  });
  const anyFailed = report.outcomes.some((o) => o.result === "failed");
  const stdout = opts.json ? syncJson(report) : syncSummary(report);
  return { code: anyFailed ? 1 : 0, stdout, stderr: "" };
}
