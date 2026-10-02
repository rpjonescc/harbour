import type { ReactNode } from "react";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { IdeaView } from "@/lib/content/read/view-types";
import { RunButton } from "./RunButton";

/** A headline and one short line; the angle, question and sources are one click away. */
export function IdeaCard({ idea, children }: { idea: IdeaView; children?: ReactNode }) {
  const heading = `idea-${idea.id}`;
  return (
    <article aria-labelledby={heading}>
      <Panel className="flex flex-col gap-2 p-4">
        <h3 id={heading} className="font-serif text-lg">
          {idea.title}
        </h3>
        <p className="text-sm text-ink-muted">{idea.why}</p>
        <p className="flex flex-wrap gap-2">
          <Tag tone="neutral">{idea.productName}</Tag>
          {idea.pillar && <Tag tone="neutral">{idea.pillar}</Tag>}
        </p>
        {idea.note && <p className="text-sm text-ink">{idea.note}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {idea.tab === "ideas" &&
            (idea.retry ? (
              <RunButton
                label="Try again"
                body={{ action: "try-again", ideaId: idea.id }}
                doneText="Started again."
              />
            ) : (
              <RunButton
                label="Write this"
                body={{ action: "write-this", ideaId: idea.id }}
                doneText="Writing has started."
              />
            ))}
          {children}
        </div>
        <TechnicalDetails id={`idea-${idea.id}`} topic="the angle, the question and the sources">
          <dl className="text-xs text-ink-muted">
            <dt>Angle</dt>
            <dd>{idea.angle}</dd>
            <dt>Audience question</dt>
            <dd>{idea.audienceQuestion}</dd>
            <dt>Sources</dt>
            <dd>{idea.sources.join(", ")}</dd>
          </dl>
        </TechnicalDetails>
      </Panel>
    </article>
  );
}
