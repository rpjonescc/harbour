import type { actionEvents } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import { readDocs, readEvidence } from "../evidence";
import { actionHandoffPrompt } from "../handoff";
import type { ActionActor, ActionRow } from "../types";

type Event = typeof actionEvents.$inferSelect;

const ACTOR: Record<ActionActor, string> = {
  owner: "Owner",
  claude: "Claude",
  scan: "Scan",
  agent: "Weekly analyst",
  system: "Harbour",
};

/** `#id  product  area  status  impact/effort  title  [PR]`. */
export function listLine(row: ActionRow): string {
  const cells = [
    `#${row.id}`,
    row.productId,
    row.area,
    row.status,
    `${row.impact}/${row.effort}`,
    row.title,
  ];
  return [...cells, ...(row.prUrl ? ["[PR]"] : [])].join("  ");
}

/** The fields `list --json` prints for each action (not its internal keys). */
export function jsonRow(row: ActionRow) {
  const { ruleKey, sourceJobId, titleKey, issuePresent, updatedAt, ...fields } = row;
  return fields;
}

function evidenceLines(stored: unknown): string[] {
  const { evidence, invalid } = readEvidence(stored);
  if (invalid) return ["Evidence: Harbour could not read the stored evidence."];
  const items = evidence.items.map(({ text, url }) =>
    url && url !== text ? `- ${text} (${url})` : `- ${text}`,
  );
  const more = evidence.total - evidence.items.length;
  return [`Evidence (${evidence.total}):`, ...items, ...(more > 0 ? [`- …and ${more} more`] : [])];
}

function move(event: Event): string | null {
  if (event.from === null) return `created as ${event.to}`;
  return event.from === event.to ? null : `${event.from} → ${event.to}`;
}

function historyLine(event: Event): string {
  const cells = [event.at.toISOString(), ACTOR[event.actor], move(event), event.note];
  return `- ${cells.filter((cell) => cell !== null && cell !== "").join("  ")}`;
}

/** Everything about one action, as plain text for a terminal. */
export function showText(
  row: ActionRow,
  product: Pick<Product, "id" | "name" | "url">,
  history: { events: Event[]; truncated: boolean },
): string {
  const status = row.status === "snoozed" ? `snoozed until ${row.snoozedUntil}` : row.status;
  const source = row.source === "rule" ? `scan rule ${row.ruleKey}` : "weekly analyst";
  const { docs, invalid: docsInvalid } = readDocs(row.docs);
  return [
    `#${row.id}  ${row.title}`,
    `Product: ${product.name} (${product.id})`,
    `Area: ${row.area}  Impact: ${row.impact}  Effort: ${row.effort}`,
    `Status: ${status}`,
    `Source: ${source}`,
    `Pull request: ${row.prUrl ?? "none"}`,
    `Created: ${row.createdAt.toISOString()}  Status changed: ${row.statusChangedAt.toISOString()}`,
    "",
    `Why: ${row.why}`,
    `Fix: ${row.fix}`,
    `Done when: ${row.check}`,
    "",
    ...evidenceLines(row.evidence),
    ...(docsInvalid
      ? ["Docs: Harbour could not read the stored docs."]
      : docs.map((d) => `Doc: ${d}`)),
    "",
    "History:",
    ...(history.truncated ? ["- (older history pruned)"] : []),
    ...history.events.map(historyLine),
    "",
    "Hand to Claude prompt:",
    actionHandoffPrompt(product, row),
  ].join("\n");
}
