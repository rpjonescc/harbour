import Link from "next/link";
import { type ReactNode, useId } from "react";
import { columnHeadingId } from "@/components/actions/focus-after-change";
import { Explainer } from "@/components/explain/Explainer";
import { Panel } from "@/components/ui/Panel";
import { STRIP_TEXT } from "@/lib/explain/board";
import type { WorkStrip as WorkStripData } from "@/lib/today/work-strip";
import { FlowBar } from "./FlowBar";

const LINK =
  "min-h-11 rounded-sm text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** A tile that is a link only when there is something behind it. */
function GroupTile({
  title,
  sentence,
  href,
  linkText,
  active,
  children,
}: {
  title: string;
  sentence: string;
  href: string;
  linkText: string;
  active: boolean;
  children?: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-2 p-4">
      <h3 className="font-medium text-ink">{title}</h3>
      <p className="text-sm text-ink">{sentence}</p>
      {children}
      {active && (
        <Link href={href} className={`${LINK} inline-flex items-center text-sm`}>
          {linkText}
        </Link>
      )}
    </Panel>
  );
}

/**
 * Today's "Where the work is" band: a tile per board column, a flow bar, the stuck and needs-you
 * groups in plain sentences, and what moved today. A server component: it needs no script.
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
      <div className="grid gap-2 sm:grid-cols-2">
        <GroupTile
          title={STRIP_TEXT.stuckTitle}
          sentence={STRIP_TEXT.stuck(stuck.count)}
          href={stuck.href}
          linkText={STRIP_TEXT.stuckLink}
          active={stuck.count > 0}
        />
        <GroupTile
          title={STRIP_TEXT.needsTitle}
          sentence={STRIP_TEXT.needs(needsYou.count)}
          href={needsYou.href}
          linkText={STRIP_TEXT.needsLink}
          active={needsYou.count > 0}
        >
          {needsYou.lines.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
              {needsYou.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {needsYou.count > needsYou.lines.length && (
                <li className="list-none">
                  {STRIP_TEXT.needsMore(needsYou.count - needsYou.lines.length)}
                </li>
              )}
            </ul>
          )}
        </GroupTile>
      </div>
      <p className="text-sm text-ink-muted">
        {STRIP_TEXT.moved(movedToday.count)}
        {movedToday.lastLine && <> {movedToday.lastLine}</>}
      </p>
    </section>
  );
}
