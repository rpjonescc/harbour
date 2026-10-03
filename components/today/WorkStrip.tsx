import { Hand, Hourglass, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { columnHeadingId } from "@/components/actions/focus-after-change";
import { Explainer } from "@/components/explain/Explainer";
import { STRIP_TEXT } from "@/lib/explain/board";
import type { WorkStrip as WorkStripData } from "@/lib/today/work-strip";
import { FlowBar } from "./FlowBar";

const LINK =
  "min-h-11 rounded-sm text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** One line of the strip: a sentence, and a link to the board's focus only when there is something. */
function SignalLine({
  icon: Icon,
  sentence,
  href,
  linkText,
  active,
}: {
  icon: LucideIcon;
  sentence: string;
  href: string;
  linkText: string;
  active: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface px-3 py-1">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1 py-2 text-sm text-ink">{sentence}</span>
      {active && (
        <Link href={href} className={`${LINK} inline-flex items-center text-sm`}>
          {linkText}
        </Link>
      )}
    </li>
  );
}

/**
 * Today's "Where the work is" band: a tile per board column, a flow bar, one line each for the stuck
 * jobs and the jobs that need the owner (counts linking to the board's focus), and what moved today. A server component: it needs no script.
 */
export function WorkStrip({ strip }: { strip: WorkStripData }) {
  const headingId = useId();
  const everything = strip.tiles.reduce((sum, tile) => sum + tile.count, 0);
  const { stuck, needsYou, movedToday } = strip;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-serif text-xl">
        {STRIP_TEXT.heading}
      </h2>
      <Explainer
        topic={STRIP_TEXT.heading}
        oneLiner={STRIP_TEXT.oneLiner}
        nextStep={{ href: "/actions?view=board", label: STRIP_TEXT.openBoard }}
        items={STRIP_TEXT.explainer}
      />
      {everything === 0 ? (
        <p className="text-sm text-ink-muted">{STRIP_TEXT.nothingYet}</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {strip.tiles.map((tile) => (
              <li key={tile.column}>
                <Link
                  href={`${tile.href}#${columnHeadingId(tile.column)}`}
                  aria-label={STRIP_TEXT.columnTile(tile.column, tile.count)}
                  className="flex min-h-11 flex-col rounded-md border border-line bg-surface p-3 hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="text-sm text-ink-muted">{tile.name}</span>
                  <span className="text-ink tabular-nums">{STRIP_TEXT.cards(tile.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <FlowBar tiles={strip.tiles} />
        </>
      )}
      {/* One line each: the full list of what needs the owner is Today's own "Needs you". */}
      <ul className="grid gap-2 sm:grid-cols-2">
        <SignalLine
          icon={Hourglass}
          sentence={STRIP_TEXT.stuck(stuck.count)}
          href={stuck.href}
          linkText={STRIP_TEXT.stuckLink}
          active={stuck.count > 0}
        />
        <SignalLine
          icon={Hand}
          sentence={STRIP_TEXT.needs(needsYou.count)}
          href={needsYou.href}
          linkText={STRIP_TEXT.needsLink}
          active={needsYou.count > 0}
        />
      </ul>
      <p className="text-sm text-ink-muted">
        {STRIP_TEXT.moved(movedToday.count)}
        {movedToday.lastLine && <> {movedToday.lastLine}</>}
      </p>
    </section>
  );
}
