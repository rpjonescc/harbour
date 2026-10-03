import { and, eq, notInArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { insertAction, normaliseTitle } from "../store";
import type { Evidence, NewAction } from "../types";
import type { AddInput } from "./add-args";

/** Said when --fix or --check is left out: the action still reads properly on the board. */
export const NO_FIX = "No fix written yet: decide it when you pick this up.";
export const NO_CHECK = "Whoever picks it up marks it done.";

const EVENT_NOTE = "Added by hand through the CLI";

export type AddResult = { ok: true; id: number } | { ok: false; duplicateOf: number };

/**
 * Doc links are kept as linked evidence: the docs column holds brain paths, which a web link
 * is not, and the card shows linked evidence already.
 */
function evidenceOf(input: AddInput): Evidence {
  const items = [
    ...input.evidence.map((text) => ({ text, url: null })),
    ...input.docs.map((url) => ({ text: url, url })),
  ];
  return { items, total: items.length };
}

function newAction(input: AddInput): NewAction {
  return {
    productId: input.productId,
    area: input.area,
    title: input.title,
    why: input.why,
    fix: input.fix ?? NO_FIX,
    check: input.check ?? NO_CHECK,
    impact: input.impact,
    effort: input.effort,
    evidence: evidenceOf(input),
    docs: [],
    source: "manual",
    ruleKey: null,
    sourceJobId: null,
    status: input.status,
    stage: input.stage,
    snoozedUntil: null,
    issuePresent: null,
  };
}

/**
 * Creates a hand-made action as Claude, unless the product already has one with the same title
 * that is not done or dismissed. The check, the row, its history and the audit entry share one
 * IMMEDIATE transaction.
 */
export function addAction(db: Db, input: AddInput, now: Date): AddResult {
  return db.transaction(
    (tx): AddResult => {
      const twin = tx
        .select({ id: actions.id })
        .from(actions)
        .where(
          and(
            eq(actions.productId, input.productId),
            eq(actions.titleKey, normaliseTitle(input.title)),
            notInArray(actions.status, ["done", "dismissed"]),
          ),
        )
        .get();
      if (twin) return { ok: false, duplicateOf: twin.id };
      const id = insertAction(tx, newAction(input), "claude", EVENT_NOTE, now);
      // Never the text: it is free text.
      const detail = { id, productId: input.productId, status: input.status };
      audit(tx, { login: "claude", event: "action_created", detail }, now);
      return { ok: true, id };
    },
    { behavior: "immediate" },
  );
}
