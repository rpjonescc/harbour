import { BOARD_COLUMNS, type BoardColumnId } from "../board-column";
import { CliUsageError } from "./usage-error";

/** One board column name as typed; throws CliUsageError for anything else. */
export function columnArg(raw: string): BoardColumnId {
  const found = BOARD_COLUMNS.find((c) => c === raw);
  if (!found) throw new CliUsageError(`Unknown column: ${raw}`);
  return found;
}

/** Refuses --status and --column together: each names where a card is, so one is enough. */
export function rejectStatusWithColumn(values: { status?: string; column?: string }): void {
  if (values.status !== undefined && values.column !== undefined) {
    throw new CliUsageError("Use --status or --column, not both");
  }
}
