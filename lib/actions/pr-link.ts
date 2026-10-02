import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { parsePullRequestUrl } from "./pr-url";
import { addActionEvent } from "./store";

export type PullRequestLinkRequest = {
  id: number;
  /** A GitHub pull request URL as given (validated here), or null to clear the link. */
  url: string | null;
  productIds: readonly string[];
  now: Date;
};

export type PullRequestLinkResult =
  | { ok: true; id: number; prUrl: string | null }
  | { ok: false; error: "not_found" | "invalid_url" };

/**
 * Links (or clears) the pull request that fixes an action, for Claude. The status stays as it
 * is: the history entry runs from the current status to itself, with the link as its note.
 * The write, its history entry and its audit entry share one IMMEDIATE transaction.
 */
export function linkPullRequest(db: Db, req: PullRequestLinkRequest): PullRequestLinkResult {
  let prUrl: string | null = null;
  if (req.url !== null) {
    const parsed = parsePullRequestUrl(req.url);
    if (!parsed.ok) return { ok: false, error: "invalid_url" };
    prUrl = parsed.url;
  }
  return db.transaction(
    (tx): PullRequestLinkResult => {
      const row = tx.select().from(actions).where(eq(actions.id, req.id)).get();
      if (!row || !req.productIds.includes(row.productId)) return { ok: false, error: "not_found" };
      if (row.prUrl === prUrl) return { ok: true, id: req.id, prUrl };
      tx.update(actions).set({ prUrl, updatedAt: req.now }).where(eq(actions.id, req.id)).run();
      const note = prUrl === null ? "Cleared the PR link" : `Linked PR ${prUrl}`;
      const { status } = row;
      addActionEvent(tx, {
        actionId: req.id,
        at: req.now,
        actor: "claude",
        from: status,
        to: status,
        note,
      });
      audit(
        tx,
        { login: "claude", event: "action_pr_linked", detail: { id: req.id, url: prUrl } },
        req.now,
      );
      return { ok: true, id: req.id, prUrl };
    },
    { behavior: "immediate" },
  );
}
