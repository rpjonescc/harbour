import { createHash } from "node:crypto";
import { join } from "node:path";
import { type ChainPiece, chainNext, finalPiece, summaries } from "@/lib/content/chain";
import { renderFile } from "@/lib/content/files";
import { PLATFORMS, type Platform } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { type ReadPiece, renderGates } from "@/lib/content/read/pieces";
import { renderPiece } from "@/lib/content/render";
import type { GateEntry, PieceFront } from "@/lib/content/schema";
import type { PieceContent } from "@/lib/content/shapes";
import { transition } from "@/lib/content/state";
import { readBoundedBytes } from "@/lib/note/bounded-read";
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

// A piece or sidecar is a few tens of KiB; anything bigger, or not a plain file, is not what the
// worker wrote, and hashes as its own value so the stale guard still sees it change.
const MAX_HASHED_BYTES = 2 * 1024 * 1024;

const bytesHash = (root: string, path: string): string => {
  try {
    const bytes = readBoundedBytes(join(root, path), MAX_HASHED_BYTES);
    return bytes === null ? "unreadable" : createHash("sha256").update(bytes).digest("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
};

/** A hash of the exact bytes of every piece file and sidecar the idea has (or lacks) right now. */
function filesHash(root: string, ideaId: string): string {
  return PLATFORMS.map(
    (p) =>
      `${bytesHash(root, contentPaths.piece(ideaId, p))}/${bytesHash(root, contentPaths.gates(ideaId, p))}`,
  ).join(",");
}

/**
 * Refuses to write over a piece the owner touched since the spec was built: the exact bytes of
 * every piece file and sidecar of the idea must be as they were, so a hand edit that left the
 * revision alone is caught too. Call it when the spec is built; call the result before writing.
 */
export function pieceGuard(root: string, ideaId: string): () => void {
  const before = filesHash(root, ideaId);
  return () => {
    if (filesHash(root, ideaId) !== before) throw new DraftStartError(CHANGED);
  };
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
