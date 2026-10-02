import { Panel } from "@/components/ui/Panel";
import type { IdeaView, TabId } from "@/lib/content/read/view-types";
import { IdeaDiscard } from "./IdeaDiscard";
import { PieceActions } from "./PieceActions";
import { PieceView } from "./PieceView";
import { RunButton } from "./RunButton";
import { StateTag } from "./StateTag";

function summaryLine(idea: IdeaView): string {
  const allApproved = idea.pieces.length > 0 && idea.pieces.every((p) => p.tab === "approved");
  if (!allApproved) return idea.rollup;
  return idea.pieces.length === 6 ? "All six are ready to post." : "All of them are ready to post.";
}

/** One card per idea, one row per piece in this tab; a row opens to the piece. */
export function PieceGroup({ idea, tab }: { idea: IdeaView; tab: TabId }) {
  const rows = idea.pieces.filter((p) => p.tab === tab);
  const heading = `group-${tab}-${idea.id}`;
  return (
    <article aria-labelledby={heading}>
      <Panel className="flex flex-col gap-2 p-4">
        <h3 id={heading} className="font-serif text-lg">
          {idea.title}
        </h3>
        <p className="text-sm text-ink-muted">{summaryLine(idea)}</p>
        <ul className="divide-y divide-line">
          {rows.map((piece) => (
            <li key={piece.id}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 rounded-sm py-2 text-sm">
                  <span className="font-medium">{piece.platformName}</span>
                  <StateTag tab={piece.tab} />
                  {piece.flags.length > 0 && (
                    <span className="text-xs text-ink-muted">{piece.flags.length} to check</span>
                  )}
                  {piece.saving && (
                    <span className="text-xs text-ink-muted">Saving your decision</span>
                  )}
                </summary>
                <PieceView piece={piece}>
                  {piece.retry && (
                    <div>
                      <RunButton
                        label="Try again"
                        body={{ action: "try-again", ideaId: idea.id }}
                        doneText="Started again."
                      />
                    </div>
                  )}
                  <PieceActions piece={piece} />
                </PieceView>
              </details>
            </li>
          ))}
        </ul>
        {tab !== "discarded" && <IdeaDiscard idea={idea} />}
      </Panel>
    </article>
  );
}
