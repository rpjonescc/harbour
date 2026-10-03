import Link from "next/link";
import { BriefingText } from "@/components/today/BriefingText";
import { SampleBanner } from "@/components/today/SampleBanner";
import type { Briefing } from "@/lib/explain/briefing";
import { SECTION_TITLES } from "@/lib/explain/tower";
import { RUNWAY_TEXT } from "@/lib/explain/tower-tiles";
import type { TileResult } from "@/lib/tower/load-tile";
import type { RunwayCard as RunwayCardData } from "@/lib/tower/runway";
import { TILE_LINK } from "./link-styles";
import { RunwayCard } from "./RunwayCard";
import { TileFailed } from "./TileFailed";
import { TowerSection } from "./TowerSection";

type Props = {
  result: TileResult<RunwayCardData[]>;
  briefing: Briefing;
  /** No checks yet: the cards show the labelled sample, as Today did. */
  isSample: boolean;
  anchor?: string;
};

function Cards({ cards }: { cards: RunwayCardData[] }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-ink">
        {RUNWAY_TEXT.noProducts}{" "}
        <Link href="/settings" className={TILE_LINK}>
          {RUNWAY_TEXT.addProduct}
        </Link>
      </p>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <li key={card.productId}>
          <RunwayCard card={card} />
        </li>
      ))}
    </ul>
  );
}

/** How is each product doing? The briefing leads, then one runway card per product. */
export function RunwayGrid({ result, briefing, isSample, anchor }: Props) {
  return (
    <TowerSection section="products" anchor={anchor}>
      <BriefingText briefing={briefing} isSample={isSample} level="lead" />
      {isSample && <SampleBanner />}
      {result.ok ? (
        <Cards cards={result.data} />
      ) : (
        <TileFailed tile={SECTION_TITLES.products} detail={result.detail} />
      )}
    </TowerSection>
  );
}
