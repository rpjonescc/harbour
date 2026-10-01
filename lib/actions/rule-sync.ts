import type { Issue, RuleOutcome } from "@/lib/scan/issues";
import { httpUrl, MAX_DOCS, MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_TEXT } from "./evidence";
import type { ActionFields, ActionRow, ActionStatus, Evidence, EvidenceItem } from "./types";

// How rule actions follow a scan: each rule's outcome against the action it raised before.
// Missing data ("unknown") never creates, resolves or reopens an action.

export type RuleActionState = Pick<ActionRow, "id" | "ruleKey" | "status" | "issuePresent">;
export type SyncChange =
  | { kind: "insert"; issue: Issue; note: string }
  | { kind: "refresh"; id: number; issue: Issue }
  | {
      kind: "status";
      id: number;
      from: ActionStatus;
      to: "open" | "done";
      issue: Issue | null;
      note: string;
    }
  | { kind: "presence"; id: number; present: boolean };

const MAX_TITLE = 120;
const MAX_WHY = 800;
const MAX_FIX = 800;
const MAX_CHECK = 400;
/** Statuses the owner has not closed: a cleared issue resolves them. */
const UNRESOLVED: readonly ActionStatus[] = ["open", "in_progress", "snoozed"];

const clamp = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max));

/** A location as evidence, linked when it is (or starts with) an http(s) URL. */
function evidenceItem(location: string): EvidenceItem {
  // Notes follow the URL ("…/a, linked from …"): their punctuation is not part of it.
  const lead = (location.split(/\s/, 1)[0] ?? "").replace(/[,;.)]+$/, "");
  const url = httpUrl.safeParse(lead);
  return { text: clamp(location, MAX_EVIDENCE_TEXT), url: url.success ? url.data : null };
}

function evidenceOf(issue: Issue): Evidence {
  const items = issue.locations.slice(0, MAX_EVIDENCE_ITEMS).map(evidenceItem);
  return { items, total: Math.max(issue.total, items.length) };
}

/** An issue's content as action fields, each within the action's bounds. */
export function actionFields(issue: Issue): ActionFields {
  return {
    area: issue.area,
    title: clamp(issue.title, MAX_TITLE),
    why: clamp(issue.problem, MAX_WHY),
    fix: clamp(issue.fix, MAX_FIX),
    check: clamp(issue.check, MAX_CHECK),
    impact: issue.impact,
    effort: issue.effort,
    evidence: evidenceOf(issue),
    docs: issue.docs.slice(0, MAX_DOCS),
  };
}

function planPresent(row: RuleActionState | undefined, issue: Issue, date: string): SyncChange {
  if (!row) return { kind: "insert", issue, note: `Found in scan of ${date}` };
  const reopen = (note: string): SyncChange => {
    return { kind: "status", id: row.id, from: row.status, to: "open", issue, note };
  };
  // The owner marked it done but the scan still finds it.
  if (row.status === "done" && row.issuePresent === true) {
    return reopen(`Still present in scan of ${date}`);
  }
  // It had cleared since the owner closed it, and now it is back.
  if ((row.status === "done" || row.status === "dismissed") && row.issuePresent !== true) {
    return reopen(`Back in scan of ${date}`);
  }
  // Dismissed stays dismissed while the issue persists; a snooze lasts until its date.
  return { kind: "refresh", id: row.id, issue };
}

function planClear(row: RuleActionState | undefined, date: string): SyncChange | null {
  if (!row) return null;
  if (UNRESOLVED.includes(row.status)) {
    const note = `Resolved — not found in scan of ${date}`;
    return { kind: "status", id: row.id, from: row.status, to: "done", issue: null, note };
  }
  if (row.issuePresent === false) return null;
  return { kind: "presence", id: row.id, present: false };
}

/**
 * The changes one scan's rule outcomes make to a product's rule actions. Pure. Actions whose rule
 * has no outcome (e.g. a retired rule) are left alone.
 */
export function planRuleSync(
  existing: readonly RuleActionState[],
  outcomes: readonly RuleOutcome[],
  scanDate: string,
): SyncChange[] {
  const byRule = new Map(existing.map((row) => [row.ruleKey, row]));
  return outcomes.flatMap((outcome): SyncChange[] => {
    const row = byRule.get(outcome.ruleId);
    if (outcome.state === "present") return [planPresent(row, outcome.issue, scanDate)];
    if (outcome.state === "unknown") return [];
    const change = planClear(row, scanDate);
    return change ? [change] : [];
  });
}
