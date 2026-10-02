import type { ReactNode } from "react";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import type { PieceView as Piece } from "@/lib/content/read/view-types";
import { STUB_FALLBACK } from "@/lib/explain/content";
import { CopyButton } from "./CopyButton";
import { GateDetails } from "./GateDetails";

/**
 * One piece as the reader will see it: plain text (escaped, never markdown or HTML, because agent
 * output is untrusted), flags in plain sight, Copy buttons, and the checks folded away.
 */
export function PieceView({ piece, children }: { piece: Piece; children?: ReactNode }) {
  return (
    <section
      aria-label={`${piece.platformName}: ${piece.title}`}
      className="flex flex-col gap-3 py-3"
    >
      {piece.needsYou && <p className="text-sm text-ink">{piece.needsYou}</p>}
      {piece.empty ? (
        // The reason above is the worker's own sentence; only say it here when there is none.
        !piece.needsYou && <p className="text-sm text-ink">{STUB_FALLBACK}</p>
      ) : (
        <div className="whitespace-pre-wrap break-words rounded-sm border border-line bg-surface-sunk p-3 text-sm">
          {piece.text}
        </div>
      )}
      {piece.flagLines.length > 0 && (
        <ul className="text-sm font-medium text-ink">
          {piece.flagLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {piece.copy.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {piece.copy.map((part) => (
            <CopyButton key={part.label} label={part.label} text={part.text} />
          ))}
        </div>
      )}
      {children}
      <TechnicalDetails id={`content-${piece.id}`} topic="checks, claims and skills for this piece">
        <GateDetails piece={piece} />
      </TechnicalDetails>
    </section>
  );
}
