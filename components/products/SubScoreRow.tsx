import { Explainer } from "@/components/explain/Explainer";
import { Tag } from "@/components/ui/Tag";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import {
  isInformational,
  NOT_COUNTED,
  subScoreExplanation,
  subScoreLine,
} from "@/lib/explain/subscores";
import { type VerdictTone, verdictFor } from "@/lib/explain/verdict";
import type { OutsideView } from "@/lib/scan/outside-view";

/** No red: the verdict word carries the meaning, the tone only supports it. */
const TAG_TONE: Readonly<Record<VerdictTone, "good" | "warn" | "neutral">> = {
  strong: "good",
  good: "good",
  fair: "neutral",
  weak: "warn",
  gap: "neutral",
};

function Verdict({ entry: { score, weight } }: { entry: ScoreBreakdownEntry }) {
  if (score === null) return <Tag tone="neutral">Not counted yet</Tag>;
  if (isInformational({ score, weight })) return <Tag tone="neutral">{NOT_COUNTED}</Tag>;
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

/**
 * One sub-score: its plain name, a verdict chip, one plain sentence and "What's this?". `outside`
 * is the state of How the web sees you, which AI engine mentions point to.
 */
export function SubScoreRow({
  entry,
  outside,
}: {
  entry: ScoreBreakdownEntry;
  outside?: OutsideView["state"];
}) {
  const explanation = subScoreExplanation(entry.key);
  const name = explanation?.name ?? entry.label;
  const sentence = subScoreLine(entry, outside);
  return (
    <li className="flex flex-col gap-1.5 py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="mr-1 text-base font-medium text-ink">{name}</h3>
        <Verdict entry={entry} />
      </div>
      {explanation ? (
        <Explainer topic={name} oneLiner={sentence} parts={explanation.parts} />
      ) : (
        <p className="text-sm text-ink">{sentence}</p>
      )}
    </li>
  );
}
