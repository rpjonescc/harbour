import { Panel } from "@/components/ui/Panel";
import { LIGHT_LABELS, SECTION_TITLES } from "@/lib/explain/tower";
import { SYSTEMS_TEXT } from "@/lib/explain/tower-tiles";
import type { TileResult } from "@/lib/tower/load-tile";
import type { Light, Lights } from "@/lib/tower/system";
import { troubleLights } from "@/lib/tower/trouble";
import { LightDetails } from "./LightDetails";
import { LightMark } from "./StatusLight";
import { TileFailed } from "./TileFailed";
import { TowerSection } from "./TowerSection";

/** Nothing needs a look: "All eight are fine." only when they all are; busy or off are named. */
function calmLine(lights: Lights["lights"]): string {
  const labelsOf = (tone: Light["tone"]) =>
    lights.filter((l) => l.tone === tone).map((l) => LIGHT_LABELS[l.id]);
  const [working, off] = [labelsOf("busy"), labelsOf("off")];
  return working.length + off.length === 0 ? SYSTEMS_TEXT.allFine : SYSTEMS_TEXT.calm(working, off);
}

function LightsPanel({ lights }: { lights: Lights["lights"] }) {
  const { shown, more } = troubleLights(lights);
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <LightDetails lights={lights} />
      {shown.length === 0 ? (
        <p className="text-sm text-ink">{calmLine(lights)}</p>
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
