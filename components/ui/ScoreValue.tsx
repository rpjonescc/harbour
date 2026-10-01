import { Delta } from "./Delta";

/**
 * A 0–100 score with its change since the last scan. No number is a gap, shown as a dash and
 * read as "no score"; an incomplete score carries an asterisk read as "incomplete".
 */
export function ScoreValue({
  value,
  delta = null,
  complete = true,
}: {
  value: number | null;
  delta?: number | null;
  complete?: boolean;
}) {
  if (value === null) {
    return (
      <span className="text-ink-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">no score</span>
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {value}
      {!complete && (
        <>
          <span aria-hidden="true" className="text-warn">
            *
          </span>
          <span className="sr-only"> (incomplete)</span>
        </>
      )}
      {delta !== null && <Delta value={delta} />}
    </span>
  );
}
