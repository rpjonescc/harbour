import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import type { RuleOutcome } from "@/lib/scan/issues";
import { actionFields, planRuleSync, type RuleActionState, type SyncChange } from "./rule-sync";
import { insertAction, setStatus, updateActionContent } from "./store";

// Worker only: applies a scan's rule outcomes to the product's rule actions.

export type SyncInput = {
  productId: string;
  outcomes: RuleOutcome[];
  /** The scan's finish date (YYYY-MM-DD in HARBOUR_TIMEZONE), for the notes. */
  scanDate: string;
  now: Date;
};
export type SyncCounts = { created: number; resolved: number; reopened: number };

function ruleActions(tx: Db, productId: string): RuleActionState[] {
  return tx
    .select({
      id: actions.id,
      ruleKey: actions.ruleKey,
      status: actions.status,
      issuePresent: actions.issuePresent,
    })
    .from(actions)
    .where(and(eq(actions.productId, productId), eq(actions.source, "rule")))
    .all();
}

function apply(tx: Db, change: SyncChange, input: SyncInput, counts: SyncCounts): void {
  const { now } = input;
  if (change.kind === "insert") {
    const action = {
      ...actionFields(change.issue),
      productId: input.productId,
      source: "rule" as const,
      ruleKey: change.issue.id,
      sourceJobId: null,
      status: "open" as const,
      snoozedUntil: null,
      issuePresent: true,
    };
    insertAction(tx, action, "scan", change.note, now);
    counts.created += 1;
    return;
  }
  if (change.kind === "refresh") {
    updateActionContent(tx, change.id, { ...actionFields(change.issue), issuePresent: true }, now);
    return;
  }
  if (change.kind === "presence") {
    updateActionContent(tx, change.id, { issuePresent: change.present }, now);
    return;
  }
  const opts = { actor: "scan" as const, note: change.note, now };
  // The rows were read in this same immediate transaction, so they cannot have moved.
  if (!setStatus(tx, change.id, change.from, change.to, opts)) {
    throw new Error(`Action ${change.id} changed during the sync`);
  }
  const content = change.issue ? actionFields(change.issue) : {};
  updateActionContent(tx, change.id, { ...content, issuePresent: change.to === "open" }, now);
  if (change.to === "done") counts.resolved += 1;
  else counts.reopened += 1;
}

/** Brings a product's rule actions in line with one scan's outcomes, in one transaction. */
export function syncRuleActions(db: Db, input: SyncInput): SyncCounts {
  return db.transaction(
    (tx) => {
      const changes = planRuleSync(
        ruleActions(tx, input.productId),
        input.outcomes,
        input.scanDate,
      );
      const counts: SyncCounts = { created: 0, resolved: 0, reopened: 0 };
      for (const change of changes) apply(tx, change, input, counts);
      return counts;
    },
    { behavior: "immediate" },
  );
}
