import { AREAS } from "@/lib/explain/areas";
import { trendPhrase, type VerdictTone, verdictFor } from "@/lib/explain/verdict";
import type { AreaKey } from "@/lib/scan/views";

/** No red: the word carries the meaning, the tone only supports it. */
const TONE: Readonly<Record<VerdictTone, string>> = {
  strong: "text-good",
  good: "text-good",
  fair: "text-ink",
  weak: "text-warn",
  gap: "text-ink-muted",
};

type Props = {
  area: AreaKey;
  score: number | null;
  /** Change since the last check; null when either check had no number. */
  delta?: number | null;
  /** False when some of the data behind the score was missing. */
  complete?: boolean;
  /** Why there is no score, in plain words (shown instead of a verdict). */
  missingReason?: string;
  /** Table-cell form: no area name (the column header gives it). */
  compact?: boolean;
};

/** A small muted note: on its own line in a table cell, inline otherwise. */
const note = (compact: boolean) => `${compact ? "block " : ""}text-2xs text-ink-muted`;

/** An area's verdict in words first, with the number small beside it and the trend. */
export function VerdictLine({
  area,
  score,
  delta = null,
  complete = true,
  missingReason,
  compact = false,
}: Props) {
  const verdict = verdictFor(score, missingReason);
  const name = compact ? null : (
    <>
      <span className="font-medium text-ink">{AREAS[area].name}</span>{" "}
    </>
  );
  if (score === null || verdict.tone === "gap") {
    return (
      <span className="text-sm">
        {name}
        <span className={TONE.gap}>{verdict.label}</span>{" "}
        <span className={note(compact)}>{verdict.sentence}</span>
      </span>
    );
  }
  const trend = trendPhrase(delta);
  return (
    <span className="text-sm">
      {name}
      <span className={`font-medium ${TONE[verdict.tone]}`}>{verdict.label}</span>{" "}
      <span className="text-xs tabular-nums text-ink-muted">
        {score}
        <span className="sr-only"> out of 100</span>
      </span>
      {compact && !complete && (
        <>
          <span aria-hidden="true" className="text-warn">
            *
          </span>
          <span className="sr-only"> (some data missing)</span>
        </>
      )}
      {trend && (
        <>
          {" "}
          <span className={note(compact)}>{trend}</span>
        </>
      )}
      {!compact && !complete && (
        <>
          {" "}
          <span className={note(false)}>Some data was missing, so this may change.</span>
        </>
      )}
    </span>
  );
}
