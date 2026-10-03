import { Panel } from "@/components/ui/Panel";
import { SECTION_TITLES } from "@/lib/explain/tower";
import type { TileResult } from "@/lib/tower/load-tile";
import type { WeekWins } from "@/lib/tower/wins";
import { LightMark } from "./StatusLight";
import { TileFailed } from "./TileFailed";
import { TowerSection } from "./TowerSection";
import { WeekBars } from "./WeekBars";

function Wins({ wins }: { wins: WeekWins }) {
  return (
    <Panel className="flex flex-col gap-4 p-4">
      {wins.quiet !== null ? (
        <p className="text-sm text-ink">{wins.quiet}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-ink">
          {wins.lines.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="flex h-5 items-center">
                <LightMark tone="ok" />
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
      <WeekBars bars={wins.bars} />
    </Panel>
  );
}

/** What got better? Up to five wins this week in words, and the cards finished each day. */
export function WinsPanel({ result, anchor }: { result: TileResult<WeekWins>; anchor?: string }) {
  return (
    <TowerSection section="wins" anchor={anchor}>
      {result.ok ? (
        <Wins wins={result.data} />
      ) : (
        <TileFailed tile={SECTION_TITLES.wins} detail={result.detail} />
      )}
    </TowerSection>
  );
}
