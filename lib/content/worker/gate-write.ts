import { createHash } from "node:crypto";
import { summaries } from "@/lib/content/chain";
import { renderFile } from "@/lib/content/files";
import { contentPaths } from "@/lib/content/paths";
import { type ReadPiece, renderGates } from "@/lib/content/read/pieces";
import { renderPiece } from "@/lib/content/render";
import type { GateEntry, PieceFront } from "@/lib/content/schema";
import type { PieceContent } from "@/lib/content/shapes";

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
