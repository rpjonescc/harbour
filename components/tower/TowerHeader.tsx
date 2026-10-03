import { useId } from "react";
import { PageHeader } from "@/components/explain/PageHeader";
import { SECTION_TITLES } from "@/lib/explain/tower";
import { HEADER_TEXT } from "@/lib/explain/tower-tiles";
import { formatClock, formatLongDate } from "@/lib/format/date";
import { TILE_LINK } from "./link-styles";
import { TOWER_ANCHORS, type TowerSectionKey } from "./TowerSection";
import { VisibleRefresh } from "./VisibleRefresh";

type Props = {
  /** The h1's lead: is everything OK? */
  headline: string;
  /** The h1's second sentence (what needs you), announced politely when a refresh changes it. */
  subline: string;
  /** When the server drew this page: the "updated" time. */
  now: Date;
  timeZone: string;
  locale: string;
  /** A check or agent run is going: refresh more often. */
  active: boolean;
};

/**
 * The six section links. Below the wide layout they stay one short row that scrolls sideways
 * (label included), rather than wrapping into tall rows of 44 px targets above the page.
 */
function JumpList() {
  const labelId = useId();
  const sections = Object.keys(TOWER_ANCHORS) as TowerSectionKey[];
  return (
    <nav
      aria-labelledby={labelId}
      data-testid="jump-list"
      className="-mx-1 flex min-w-0 flex-nowrap items-center gap-x-3 overflow-x-auto px-1 whitespace-nowrap [scrollbar-width:thin] lg:flex-wrap lg:overflow-visible lg:whitespace-normal"
    >
      <span className="shrink-0">
        <span id={labelId}>{HEADER_TEXT.onThisPage}</span>
        <span aria-hidden="true">:</span>
      </span>
      <ul className="flex shrink-0 gap-x-3 lg:shrink lg:flex-wrap">
        {sections.map((section) => (
          <li key={section} className="shrink-0">
            <a
              href={`#${TOWER_ANCHORS[section]}`}
              className={`${TILE_LINK} inline-flex min-h-11 items-center`}
            >
              {SECTION_TITLES[section]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The tower's header: the headline as the page's only h1, the date, when this page was drawn,
 * a jump list to each section and "What's this page?". Only the sub-line is live.
 */
export function TowerHeader({ headline, subline, now, timeZone, locale, active }: Props) {
  const updated = HEADER_TEXT.updated(formatClock(now, timeZone, locale));
  return (
    <PageHeader
      page="tower"
      title={
        <>
          {headline}{" "}
          <span aria-live="polite" aria-atomic="true">
            {subline}
          </span>
        </>
      }
      intro={
        <>
          <p>
            {formatLongDate(now, timeZone, locale)} · {updated}
          </p>
          <JumpList />
          <VisibleRefresh active={active} />
        </>
      }
    />
  );
}
