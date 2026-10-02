import { Explainer } from "@/components/explain/Explainer";
import { Tag } from "@/components/ui/Tag";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { subScoreExplanation, subScoreLine } from "@/lib/explain/subscores";
import { type VerdictTone, verdictFor } from "@/lib/explain/verdict";

/** No red: the verdict word carries the meaning, the tone only supports it. */
const TAG_TONE: Readonly<Record<VerdictTone, "good" | "warn" | "neutral">> = {
  strong: "good",
  good: "good",
  fair: "neutral",
  weak: "warn",
  gap: "neutral",
};

function Verdict({ score }: { score: number | null }) {
  if (score === null) return <Tag tone="neutral">Not counted yet</Tag>;
  const verdict = verdictFor(score);
  return (
    <>
      <Tag tone={TAG_TONE[verdict.tone]}>{verdict.label}</Tag>
      <span className="text-2xs tabular-nums text-ink-muted">
        {score}
        <span className="sr-only"> out of 100</span>
      </span>
    </>
  );
}

/** One sub-score: its plain name, a verdict chip, one plain sentence and "What's this?". */
export function SubScoreRow({ entry }: { entry: ScoreBreakdownEntry }) {
  const explanation = subScoreExplanation(entry.key);
  const name = explanation?.name ?? entry.label;
  const sentence = subScoreLine(entry);
  return (
    <li className="flex flex-col gap-1.5 py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="mr-1 text-base font-medium text-ink">{name}</h3>
        <Verdict score={entry.score} />
      </div>
      {explanation ? (
        <Explainer topic={name} oneLiner={sentence} parts={explanation.parts} />
      ) : (
        <p className="text-sm text-ink">{sentence}</p>
      )}
    </li>
  );
}
