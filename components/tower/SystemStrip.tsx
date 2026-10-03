import { Panel } from "@/components/ui/Panel";
import { SECTION_TITLES } from "@/lib/explain/tower";
import { SYSTEMS_TEXT } from "@/lib/explain/tower-tiles";
import type { TileResult } from "@/lib/tower/load-tile";
import type { Lights } from "@/lib/tower/system";
import { troubleLights } from "@/lib/tower/trouble";
import { LightDetails } from "./LightDetails";
import { LightMark } from "./StatusLight";
import { TileFailed } from "./TileFailed";
import { TowerSection } from "./TowerSection";

function LightsPanel({ lights }: { lights: Lights["lights"] }) {
  const { shown, more } = troubleLights(lights);
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <LightDetails lights={lights} />
      {shown.length === 0 ? (
        <p className="text-sm text-ink">{SYSTEMS_TEXT.allFine}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-ink">
          {shown.map((light) => (
            <li key={light.id} data-testid="trouble" className="flex items-start gap-2">
              <span className="flex h-5 items-center">
                <LightMark tone={light.tone} />
              </span>
              <span>{light.sentence}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="text-xs text-ink-muted">{SYSTEMS_TEXT.more(more)}</p>}
    </Panel>
  );
}

/** Is everything OK? Eight lights in a fixed order and, under them, what is not fine. */
export function SystemStrip({ result, anchor }: { result: TileResult<Lights>; anchor?: string }) {
  return (
    <TowerSection section="systems" anchor={anchor}>
      {result.ok ? (
        <LightsPanel lights={result.data.lights} />
      ) : (
        <TileFailed tile={SECTION_TITLES.systems} detail={result.detail} />
      )}
    </TowerSection>
  );
}
