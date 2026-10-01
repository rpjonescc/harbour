import { Delta } from "@/components/ui/Delta";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { AREA_KEYS, type AreaKey, type ScoreTrend } from "@/lib/scan/views";

const NAMES: Record<AreaKey, string> = {
  seo: "Search engines",
  geo: "AI assistants",
  aeo: "Direct answers",
};

/** The three headline scores, large, each with its change, completeness and a bar. */
export function ScoreTiles({ scores }: { scores: ScoreTrend }) {
  const { latest, deltas } = scores;
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {AREA_KEYS.map((key) => {
        const value = latest?.totals[key] ?? null;
        const complete = latest?.complete[key] ?? true;
        const delta = deltas[key];
        return (
          <div
            key={key}
            className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4"
          >
            <dt className="flex items-baseline justify-between text-xs text-ink-muted">
              <span className="font-medium tracking-widest text-ink">{key.toUpperCase()}</span>
              <span>{NAMES[key]}</span>
            </dt>
            <dd className="flex items-baseline gap-1">
              {value === null ? (
                <span className="font-serif text-4xl text-ink-muted">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">no score</span>
                </span>
              ) : (
                <span className="font-serif text-4xl tabular-nums">{value}</span>
              )}
              {delta !== null && <Delta value={delta} />}
              {value !== null && !complete && (
                <span className="ml-auto text-2xs text-warn">incomplete</span>
              )}
            </dd>
            <dd>
              <ScoreBar value={value} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
