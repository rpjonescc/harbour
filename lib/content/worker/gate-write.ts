import { createHash } from "node:crypto";
import { type ChainPiece, chainNext, finalPiece, summaries } from "@/lib/content/chain";
import { renderFile } from "@/lib/content/files";
import type { Platform } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { type ReadPiece, renderGates } from "@/lib/content/read/pieces";
import { renderPiece } from "@/lib/content/render";
import type { GateEntry, PieceFront } from "@/lib/content/schema";
import type { PieceContent } from "@/lib/content/shapes";
import { transition } from "@/lib/content/state";
import { chainView } from "./chain-pieces";
import { DraftStartError } from "./draft";

/** The hash of a piece's rendered text (what the owner would copy), recorded before and after a gate. */
export const textHash = (piece: ReadPiece, content: PieceContent | null): string =>
  `sha256:${createHash("sha256")
    .update(content ? renderPiece(piece.platform, content) : "")
    .digest("hex")}`;

/** The two files a gate run rewrites for one piece: the piece and its sidecar. Worker-made, always. */
export function pieceUpdate(
  piece: ReadPiece,
  entries: GateEntry[],
  content: PieceContent,
  extra: Partial<PieceFront> = {},
): Record<string, string> {
  const front: PieceFront = {
    ...piece.front,
    ...extra,
    content,
    revision: piece.front.revision + 1,
    gates: summaries(entries),
  };
  const { ideaId, platform } = piece.front;
  return {
    [contentPaths.piece(ideaId, platform)]: renderFile(front, renderPiece(platform, content)),
    [contentPaths.gates(ideaId, platform)]: renderGates(entries),
  };
}

export type PieceChange = {
  piece: ReadPiece;
  entries: GateEntry[];
  content: PieceContent;
  extra?: Partial<PieceFront>;
};

const CHANGED = "A piece changed while it was being checked, so Harbour saved nothing.";

/**
 * Refuses to write over a piece the owner touched since the run began: every piece the run saw
 * must still be there at the same revision and state, with the same results.
 */
export function assertUnchanged(root: string, ideaId: string, seen: readonly ReadPiece[]): void {
  const now = chainView(root, ideaId).pieces;
  for (const was of seen) {
    const same = now.find((p) => p.platform === was.platform);
    if (
      !same ||
      same.front.revision !== was.front.revision ||
      same.front.state !== was.front.state ||
      same.gates.length !== was.gates.length
    ) {
      throw new DraftStartError(CHANGED);
    }
  }
}

/**
 * Every file a gate run writes. While the chain still has a gate to run, pieces stay `drafting`;
 * once it is done, every live `drafting` piece (the ones this run did not touch too) becomes Ready
 * or Needs you from its own results and the questions asked, through the state machine. Only the
 * worker ever decides this.
 */
export function writeUpdates(
  view: { pieces: ReadPiece[]; chain: ChainPiece[] },
  changes: ReadonlyMap<Platform, PieceChange>,
  sourceQuestions: readonly string[],
): Record<string, string> {
  const after = view.chain.map((p) => {
    const change = changes.get(p.platform);
    return change ? { ...p, entries: change.entries } : p;
  });
  const done = chainNext(after) === null;
  const out: Record<string, string> = {};
  for (const piece of view.pieces) {
    const change = changes.get(piece.platform);
    const finishing = done && piece.front.state === "drafting" && piece.content !== null;
    if (!change && !finishing) continue;
    const entries = change?.entries ?? piece.gates;
    const content = change?.content ?? piece.content;
    if (content === null) throw new Error("A piece with no content is not a gate target");
    const extra: Partial<PieceFront> = { ...change?.extra };
    if (finishing) {
      const final = finalPiece(entries, [...sourceQuestions, ...piece.front.questions]);
      const state = transition(piece.front.state, "finish", final.state);
      if (state === null) throw new Error("A piece was not in a state that can be finished");
      Object.assign(extra, { state, needsYou: final.needsYou });
    }
    Object.assign(out, pieceUpdate(piece, entries, content, extra));
  }
  return out;
}
