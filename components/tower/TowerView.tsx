import { NoteCard } from "@/components/today/note/NoteCard";
import { WorkStrip } from "@/components/today/WorkStrip";
import { SECTION_TITLES } from "@/lib/explain/tower";
import type { NoteSlot } from "@/lib/note/view";
import type { Tower } from "@/lib/tower/load";
import { ActivityFeed } from "./ActivityFeed";
import { NeedsYou } from "./NeedsYou";
import { RunwayGrid } from "./RunwayGrid";
import { SystemStrip } from "./SystemStrip";
import { TileFailed } from "./TileFailed";
import { TowerHeader } from "./TowerHeader";
import { TOWER_ANCHORS, TowerSection } from "./TowerSection";
import { WinsPanel } from "./WinsPanel";

type Props = {
  tower: Tower;
  /** The daily note; null when the personality is quiet. */
  note: NoteSlot | null;
  now: Date;
  timeZone: string;
  locale: string;
};

/** Where the work is: the Board's strip unchanged (it brings its own h2), or why it is missing. */
function Work({ work }: { work: Tower["work"] }) {
  if (!work.ok) {
    return (
      <TowerSection section="work">
        <TileFailed tile={SECTION_TITLES.work} detail={work.detail} />
      </TowerSection>
    );
  }
  return (
    <div id={TOWER_ANCHORS.work} className="scroll-mt-4">
      <WorkStrip strip={work.data} />
    </div>
  );
}

/**
 * Today as a control tower, in the order the owner asks: is everything OK, what needs me, where
 * the work is, how each product is doing, what is happening and what got better. Layout only:
 * the DOM order is the reading order at every width.
 */
export function TowerView({ tower, note, now, timeZone, locale }: Props) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <TowerHeader
        headline={tower.headline}
        subline={tower.subline}
        now={now}
        timeZone={timeZone}
        locale={locale}
        active={tower.active}
      />
      <SystemStrip result={tower.systems} />
      <div className={note ? "grid items-start gap-8 lg:grid-cols-[3fr_2fr]" : undefined}>
        <NeedsYou result={tower.needs} />
        {note && <NoteCard slot={note} timeZone={timeZone} locale={locale} />}
      </div>
      <Work work={tower.work} />
      <RunwayGrid result={tower.runways} briefing={tower.briefing} isSample={tower.isSample} />
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <ActivityFeed result={tower.activity} />
        <WinsPanel result={tower.wins} />
      </div>
    </div>
  );
}
