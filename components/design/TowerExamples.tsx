import {
  NeedsYou,
  RunwayCard,
  RunwayGrid,
  StatusLight,
  SystemStrip,
  TileFailed,
} from "@/components/tower";
import { LIGHT_LABELS, type LightTone, TONE_WORDS } from "@/lib/explain/tower";
import { Example } from "./Example";
import {
  BLOG_CARD,
  DOCS_CARD,
  EXAMPLE_BRIEFING,
  FAILED_TILE,
  FALLING_CARD,
  NEEDS_EXAMPLES,
  SYSTEM_EXAMPLES,
} from "./tower-example-data";

const TONES = Object.keys(TONE_WORDS) as LightTone[];
const failed = { ok: false as const, detail: FAILED_TILE.detail };

/** Fictional control tower tiles (Today): systems, needs you and product runways, every state. */
export function TowerExamples() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">
        Illustrative tiles for Acme Docs and Acme Blog. Each tile is its own section on Today.
      </p>
      <Example label="Status lights · every tone, by shape and word">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {TONES.map((tone) => (
            <li key={tone}>
              <StatusLight tone={tone} label={LIGHT_LABELS.worker} />
            </li>
          ))}
        </ul>
      </Example>
      {SYSTEM_EXAMPLES.map(({ label, result }, i) => (
        <Example key={label} label={label}>
          <SystemStrip result={result} anchor={`example-systems-${i}`} />
        </Example>
      ))}
      {NEEDS_EXAMPLES.map(({ label, result }, i) => (
        <Example key={label} label={label}>
          <NeedsYou result={result} anchor={`example-needs-${i}`} />
        </Example>
      ))}
      <Example label="Runway cards · full, with gaps, and falling while a check runs">
        <ul className="grid gap-3 md:grid-cols-3">
          {[DOCS_CARD, BLOG_CARD, FALLING_CARD].map((card) => (
            <li key={card.productId}>
              <RunwayCard card={card} />
            </li>
          ))}
        </ul>
      </Example>
      <Example label="Your products · sample data before the first check">
        <RunwayGrid
          result={{ ok: true, data: [DOCS_CARD, BLOG_CARD] }}
          briefing={EXAMPLE_BRIEFING}
          isSample
          anchor="example-products-sample"
        />
      </Example>
      <Example label="Your products · the cards couldn't be read">
        <RunwayGrid
          result={failed}
          briefing={EXAMPLE_BRIEFING}
          isSample={false}
          anchor="example-products-failed"
        />
      </Example>
      <Example label="Any tile · couldn't read its data">
        <TileFailed tile={FAILED_TILE.tile} detail={FAILED_TILE.detail} />
      </Example>
    </div>
  );
}
