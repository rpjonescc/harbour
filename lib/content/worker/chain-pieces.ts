import type { ChainPiece } from "@/lib/content/chain";
import { contentPaths } from "@/lib/content/paths";
import { type ReadPiece, readPieces } from "@/lib/content/read/pieces";

/**
 * An idea's pieces as the chain sees them. A piece whose sidecar cannot be read is left out: a
 * gate would otherwise rewrite the sidecar and lose what was in it, and the chain would wait on
 * a result it can never see. The Content page names unreadable files itself.
 */
export function chainView(
  root: string,
  ideaId: string,
): { pieces: ReadPiece[]; chain: ChainPiece[] } {
  const { pieces, unreadable } = readPieces(root, ideaId);
  const usable = pieces.filter((p) => !unreadable.includes(contentPaths.gates(ideaId, p.platform)));
  return {
    pieces: usable,
    chain: usable.map((p) => ({
      platform: p.platform,
      state: p.front.state,
      hasContent: p.content !== null,
      entries: p.gates,
    })),
  };
}
