import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { NOTHING_NEEDS_YOU, SECTION_TITLES } from "@/lib/explain/tower";
import { NEEDS_TEXT } from "@/lib/explain/tower-tiles";
import type { TileResult } from "@/lib/tower/load-tile";
import type { NeedItem } from "@/lib/tower/needs";
import { LINK_BUTTON, TILE_LINK } from "./link-styles";
import { LightMark } from "./StatusLight";
import { TileFailed } from "./TileFailed";
import { TowerSection } from "./TowerSection";

type Needs = {
  items: NeedItem[];
  more: number;
  /** Where every hidden item waits, when that is one page; else "N more" stays plain text. */
  moreHref?: string | null;
};

function More({ more, moreHref }: { more: number; moreHref?: string | null }) {
  if (more === 0) return null;
  return (
    <p className="text-xs text-ink-muted">
      {NEEDS_TEXT.more(more)}
      {moreHref && (
        <>
          {" "}
          <Link href={moreHref} className={TILE_LINK}>
            {NEEDS_TEXT.moreLink(more)}
          </Link>
        </>
      )}
    </p>
  );
}

function NeedsList({ items, more, moreHref }: Needs) {
  if (items.length === 0) {
    // Nothing waiting is a win: said calmly, with nothing to press.
    return (
      <Panel className="flex items-start gap-2 p-4 text-sm text-ink">
        <span className="flex h-5 items-center">
          <LightMark tone="ok" />
        </span>
        <p>{NOTHING_NEEDS_YOU}</p>
      </Panel>
    );
  }
  return (
    <Panel className="flex flex-col gap-2 p-4">
      <ol className="flex list-decimal flex-col divide-y divide-line pl-5 text-sm text-ink marker:text-ink-muted">
        {items.map((item) => (
          <li key={item.sentence} className="py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1 basis-48">{item.sentence}</p>
              <Link href={item.button.href} aria-label={item.button.name} className={LINK_BUTTON}>
                {item.button.label}
              </Link>
            </div>
          </li>
        ))}
      </ol>
      <More more={more} moreHref={moreHref} />
    </Panel>
  );
}

/** What needs me now? At most five things, each with exactly one link to where it is decided. */
export function NeedsYou({ result, anchor }: { result: TileResult<Needs>; anchor?: string }) {
  return (
    <TowerSection section="needs" anchor={anchor}>
      {result.ok ? (
        <NeedsList {...result.data} />
      ) : (
        <TileFailed tile={SECTION_TITLES.needs} detail={result.detail} />
      )}
    </TowerSection>
  );
}
