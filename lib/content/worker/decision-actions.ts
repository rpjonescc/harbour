import { lstatSync } from "node:fs";
import { join } from "node:path";
import { approveProblem } from "@/lib/content/decision";
import { exportSlug, renderExport } from "@/lib/content/export";
import { renderFile } from "@/lib/content/files";
import type { Platform } from "@/lib/content/ids";
import { contentPaths, isApprovedPath } from "@/lib/content/paths";
import type { ReadPiece } from "@/lib/content/read/pieces";
import { renderPiece } from "@/lib/content/render";
import { FLAGS, type Flag, type PieceFront } from "@/lib/content/schema";
import type { PieceContent } from "@/lib/content/shapes";
import { revisionMatches, transition } from "@/lib/content/state";
import {
  type Change,
  type Decision,
  type DecisionContext,
  DecisionRefusal,
  STALE,
} from "./decision-types";

export const fileText = (front: PieceFront, content: PieceContent | null) =>
  renderFile(front, content ? renderPiece(front.platform, content) : "");

/** The piece's next revision with `over` applied; every state change goes through here. */
export const bumped = (piece: ReadPiece, over: Partial<PieceFront>): PieceFront => ({
  ...piece.front,
  ...over,
  revision: piece.front.revision + 1,
});

/**
 * The stale-state guard (spec §10.3). A job that already ran (a restart repeats it) finds the
 * piece one revision on and already in its result: that is done, not stale. Anything else that
 * moved is refused so a newer edit is never overwritten.
 */
export function settle(piece: ReadPiece, d: Decision, applied: boolean): "go" | "done" {
  if (d.revision !== undefined && revisionMatches(piece.front.revision, d.revision)) return "go";
  if (d.revision !== undefined && piece.front.revision === d.revision + 1 && applied) return "done";
  throw new DecisionRefusal(STALE);
}

const NINE =
  "There are already nine exports with this name today. Retitle the piece and try again.";

/** The first of `slug`, `slug-2`, … `slug-9` that is not taken today (a link or odd file owns its name too). */
function freeExport(root: string, platform: Platform, day: string, slug: string): string {
  for (let n = 1; n <= 9; n++) {
    const path = contentPaths.approved(platform, day, n === 1 ? slug : `${slug}-${n}`);
    if (!taken(join(root, path))) return path;
  }
  throw new DecisionRefusal(NINE);
}

function taken(path: string): boolean {
  try {
    lstatSync(path); // lstat: a dangling link still owns the name
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

const tickedFlags = (text: string): Flag[] =>
  text.split(",").filter((f): f is Flag => (FLAGS as readonly string[]).includes(f));

/** Approves one piece: it becomes `approved` and its clean export is a new file. */
export function approve(ctx: DecisionContext, piece: ReadPiece, d: Decision): Change | null {
  if (settle(piece, d, piece.front.state === "approved") === "done") return null;
  const next = transition(piece.front.state, "approve");
  const problem = approveProblem(
    {
      state: piece.front.state,
      flags: piece.front.flags,
      hasContent: piece.content !== null,
      needsYou: piece.front.needsYou,
    },
    { checkedFlags: tickedFlags(d.flags), confirmOpen: d.confirm === "1" },
  );
  if (next === null || problem !== null || piece.content === null) {
    throw new DecisionRefusal(problem ?? "This piece can't be approved now.");
  }
  const { platform, ideaId, title } = piece.front;
  const exportPath = freeExport(
    ctx.root,
    platform,
    ctx.day,
    exportSlug(platform, title, piece.content),
  );
  const front = bumped(piece, { state: next, approvedAt: ctx.day, exportPath });
  return {
    write: { [contentPaths.piece(ideaId, platform)]: fileText(front, piece.content) },
    create: {
      [exportPath]: renderExport({
        title,
        product: ctx.product.id,
        platform,
        approved: ctx.day,
        idea: ideaId,
        content: piece.content,
      }),
    },
    remove: [],
    message: `content: approve ${ideaId}.${platform}`,
  };
}

type Discarded = Pick<Change, "write" | "remove">;

const BAD_EXPORT =
  "This piece's export isn't where Harbour put it, so it saved nothing. Check the piece's file, then try again.";

function discardOne(piece: ReadPiece): Discarded {
  const exportPath = piece.front.exportPath;
  // The path comes from a file the owner can edit: only a path Harbour could have made is removed.
  if (exportPath !== null && !isApprovedPath(piece.platform, exportPath)) {
    throw new DecisionRefusal(BAD_EXPORT);
  }
  const front = bumped(piece, { state: "discarded", exportPath: null });
  return {
    write: {
      [contentPaths.piece(piece.front.ideaId, piece.platform)]: fileText(front, piece.content),
    },
    remove: exportPath ? [exportPath] : [],
  };
}

/** Discards one piece; an approved piece's export goes in the same change. */
export function discardPiece(piece: ReadPiece, d: Decision): Change | null {
  if (settle(piece, d, piece.front.state === "discarded") === "done") return null;
  if (transition(piece.front.state, "discard") === null) {
    throw new DecisionRefusal("This piece is already discarded.");
  }
  return {
    ...discardOne(piece),
    create: {},
    message: `content: discard ${piece.front.ideaId}.${piece.platform}`,
  };
}

/** The idea and every piece it has, together; null when there is nothing left to discard. */
export function discardIdea(ctx: DecisionContext): Change | null {
  const live = ctx.pieces.filter((p) => transition(p.front.state, "discard") !== null);
  if (ctx.idea.front.state === "discarded" && live.length === 0) return null;
  const change: Change = {
    write: {
      [contentPaths.idea(ctx.product.id, ctx.idea.id)]: renderFile(
        { ...ctx.idea.front, state: "discarded", needsYou: null },
        ctx.idea.body,
      ),
    },
    create: {},
    remove: [],
    message: `content: discard ${ctx.idea.id}`,
  };
  for (const piece of live) {
    const one = discardOne(piece);
    Object.assign(change.write, one.write);
    change.remove.push(...one.remove);
  }
  return change;
}
