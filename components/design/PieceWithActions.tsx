import type { piece } from "@/components/content/content-fixtures";
import { PieceActions } from "@/components/content/PieceActions";
import { PieceView } from "@/components/content/PieceView";

/** A piece as the Content page shows it, with its buttons underneath. */
export function PieceWithActions({ piece: p }: { piece: ReturnType<typeof piece> }) {
  return (
    <PieceView piece={p}>
      <PieceActions piece={p} />
    </PieceView>
  );
}
