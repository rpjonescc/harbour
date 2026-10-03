import { WINS_TEXT } from "@/lib/explain/tower-tiles";
import type { WeekWins } from "@/lib/tower/wins";

/** Bar height in the 0 to 40 viewBox; an empty day keeps a sliver so the baseline reads. */
const HEIGHT = 40;
const SLIVER = 1;

/**
 * Seven small bars, "cards finished each day", with the day and the number in text under and
 * over each. The drawing is hidden from screen readers, who get a table of the same numbers.
 */
export function WeekBars({ bars }: { bars: WeekWins["bars"] }) {
  const most = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <div className="flex flex-col gap-2">
      <p aria-hidden="true" className="text-xs text-ink-muted">
        {WINS_TEXT.barsCaption}
      </p>
      <div aria-hidden="true" data-week-bars className="grid grid-cols-7 items-end gap-1">
        {bars.map((bar) => {
          const height =
            bar.count === 0 ? SLIVER : Math.max(2, Math.round((bar.count / most) * HEIGHT));
          return (
            <div key={bar.day} data-bar className="flex flex-col items-center gap-1">
              <span className="text-2xs tabular-nums text-ink">{bar.count}</span>
              <svg
                aria-hidden="true"
                viewBox={`0 0 10 ${HEIGHT}`}
                preserveAspectRatio="none"
                className="h-10 w-full max-w-6"
              >
                <rect
                  x="0"
                  y={HEIGHT - height}
                  width="10"
                  height={height}
                  rx="1"
                  className="fill-accent"
                />
              </svg>
              <span className="text-2xs text-ink-muted">{bar.label}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>{WINS_TEXT.barsCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{WINS_TEXT.dayHeader}</th>
            <th scope="col">{WINS_TEXT.countHeader}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.day}>
              <th scope="row">{bar.label}</th>
              <td>{bar.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
