import { PLATFORM_NAMES, pieceId } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { copyParts, primaryText, renderPiece } from "@/lib/content/render";
import { FLAG_WORDS } from "@/lib/explain/content";
import { type FailedStep, stepSentence } from "./chain-status";
import type { DecisionStatus } from "./decisions";
import type { ReadPiece } from "./pieces";
import type { PieceView, TabId } from "./view-types";

const DIRECT: Record<string, TabId> = {
  ready: "ready",
  "needs-you": "needs-you",
  approved: "approved",
  discarded: "discarded",
};
const pieceTab = (state: string, derivedFailure: boolean): TabId =>
  DIRECT[state] ?? (derivedFailure ? "needs-you" : "writing");

/** "Check before posting: 1 pricing claim": each flag with how many claims carry it. */
function flagLines(piece: ReadPiece): string[] {
  const counts = piece.front.flags.map((flag) => {
    const n = piece.front.claims.filter((c) => c.flag === flag).length || 1;
    return `${n} ${FLAG_WORDS[flag]} claim${n === 1 ? "" : "s"}`;
  });
  return counts.length > 0 ? [`Check before posting: ${counts.join(", ")}`] : [];
}

/** The sentence for a decision that failed at this very revision; one asked of an older file is stale. */
function failedDecision(decisions: DecisionStatus, id: string, revision: number): string | null {
  const failed = decisions.failed.get(id);
  return failed && failed.revision === String(revision) ? failed.error : null;
}

/** One piece for the page: plain text, clean copy parts, and the tab its state puts it in. */
export function pieceView(
  piece: ReadPiece,
  failed: FailedStep | null,
  decisions: DecisionStatus,
): PieceView {
  const { front, content, platform } = piece;
  const derived = front.state === "drafting" && failed !== null;
  const id = pieceId(front.ideaId, platform);
  return {
    id,
    platform,
    platformName: PLATFORM_NAMES[platform],
    tab: pieceTab(front.state, derived),
    title: front.title,
    text: content ? renderPiece(platform, content) : "",
    copy: content ? copyParts(platform, content) : [],
    editText: content ? primaryText(platform, content) : "",
    empty: content === null,
    needsYou: derived && failed ? stepSentence(failed.kind, failed.params) : front.needsYou,
    retry: derived,
    flags: front.flags,
    flagLines: flagLines(piece),
    revision: front.revision,
    edited: front.edited,
    state: front.state,
    saving: decisions.saving.has(id),
    decisionError: failedDecision(decisions, id, front.revision),
    gates: piece.gates,
    claims: front.claims,
    file: contentPaths.piece(front.ideaId, platform),
  };
}

/** "4 ready, 2 need you": the idea's pieces by tab, zero parts left out. */
export function rollup(pieces: PieceView[]): string {
  const n = (tab: TabId) => pieces.filter((p) => p.tab === tab).length;
  const parts: [number, string][] = [
    [n("ready"), "ready"],
    [n("needs-you"), n("needs-you") === 1 ? "needs you" : "need you"],
    [n("writing"), "being written"],
    [n("approved"), "approved"],
    [n("discarded"), "discarded"],
  ];
  return parts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(", ");
}
