/** Bar colour for a 0–100 score: the number beside it carries the meaning, colour reinforces it. */
export function scoreTone(value: number): string {
  if (value >= 70) return "bg-good";
  if (value >= 40) return "bg-warn";
  return "bg-bad";
}

/** Decorative 0–100 bar; always shown next to the number it draws. A gap draws an empty track. */
export function ScoreBar({ value }: { value: number | null }) {
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
      {value !== null && (
        <div
          className={`h-full rounded-full ${scoreTone(value)}`}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      )}
    </div>
  );
}
