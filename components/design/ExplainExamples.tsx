import { EmptyState } from "@/components/explain/EmptyState";
import { Explainer } from "@/components/explain/Explainer";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { VerdictLine } from "@/components/explain/VerdictLine";
import { NOTHING_TO_DO } from "@/components/today/WorthDoingNext";
import { AREAS } from "@/lib/explain/areas";
import { subScoreExplanation, subScoreLine } from "@/lib/explain/subscores";
import { GAP_REASONS } from "@/lib/explain/verdict";
import { Example } from "./Example";

/** A fictional breakdown entry, worded as the scorer words it. */
const CONCISE = {
  key: "aeo.conciseAnswers",
  score: 67,
  evidence:
    "4 of 6 question-style headings are answered by a paragraph of at most 60 words right below them.",
};

/** Fictional verdicts and explanations: every plain-language component in its main states. */
export function ExplainExamples() {
  const concise = subScoreExplanation(CONCISE.key);
  const geo = AREAS.geo;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">Illustrative verdicts and explanations.</p>
      <Example label="Verdict line · each band, a gap and a partial score">
        <div className="flex flex-col gap-1">
          <VerdictLine area="seo" score={92} delta={3} />
          <VerdictLine area="geo" score={78} delta={0} />
          <VerdictLine area="aeo" score={61} delta={-2} complete={false} />
          <VerdictLine area="seo" score={34} />
          <VerdictLine area="geo" score={null} missingReason="Speed data is still arriving." />
        </div>
      </Example>
      <Example label="Verdict line · compact, as in a table cell">
        <div className="flex flex-wrap gap-6">
          <VerdictLine compact area="seo" score={78} delta={2} />
          <VerdictLine compact area="geo" score={46} complete={false} />
          <VerdictLine compact area="aeo" score={null} missingReason={GAP_REASONS.notChecked} />
        </div>
      </Example>
      <Example label="Explainer · an area, with a next step">
        <Explainer
          topic={`${geo.name} example`}
          oneLiner={geo.oneLiner}
          parts={geo.parts}
          nextStep={{ href: "/actions?area=GEO", label: `See ideas for ${geo.name}` }}
        />
      </Example>
      {concise && (
        <Example label="Explainer · a sub-score, read from its evidence">
          <p className="text-sm font-medium">{concise.name}</p>
          <Explainer
            topic={`${concise.name} example`}
            oneLiner={subScoreLine(CONCISE)}
            parts={concise.parts}
          />
        </Example>
      )}
      <Example label="Technical details · closed by default">
        <TechnicalDetails id="design-example" topic="example evidence">
          <p className="font-mono">
            {CONCISE.key} · weight 0.35 · {CONCISE.evidence}
          </p>
        </TechnicalDetails>
      </Example>
      <Example label="Empty state">
        <EmptyState {...NOTHING_TO_DO} />
      </Example>
    </div>
  );
}
