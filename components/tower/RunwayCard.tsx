import Link from "next/link";
import { useId } from "react";
import { Term } from "@/components/explain/Term";
import { VERDICT_TONE_CLASS } from "@/components/explain/VerdictLine";
import { ProductDot } from "@/components/ui/ProductDot";
import { RUNWAY_TEXT, TREND_ARROW } from "@/lib/explain/tower-tiles";
import type { RunwayCard as RunwayCardData } from "@/lib/tower/runway";
import { TILE_LINK } from "./link-styles";
import { StatusLight } from "./StatusLight";

function Verdict({ card }: { card: RunwayCardData }) {
  const { verdict, trend } = card;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={`font-serif text-2xl ${VERDICT_TONE_CLASS[verdict.tone]}`}>
        {verdict.label}
      </span>
      {verdict.tone === "gap" && <span className="text-xs text-ink-muted">{verdict.sentence}</span>}
      {trend.direction && trend.phrase && (
        <span className="text-sm text-ink-muted">
          <span aria-hidden="true">{TREND_ARROW[trend.direction]}</span> <span>{trend.phrase}</span>
        </span>
      )}
    </p>
  );
}

/**
 * One product's runway: verdict and trend, the one next action, the last check, up to three
 * highlights, its content and Claude's last touch. The card itself is not a link: its heading,
 * next action and content line are, so each link has a short name.
 */
export function RunwayCard({ card }: { card: RunwayCardData }) {
  const headingId = useId();
  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <h3 id={headingId} className="font-serif text-lg">
        <Link
          href={`/products/${card.productId}`}
          className="inline-flex items-center gap-2 rounded-sm hover:underline"
        >
          <ProductDot product={card} />
          {card.name}
        </Link>
      </h3>
      <Verdict card={card} />
      <p className="text-sm">
        {card.next ? (
          <>
            <span className="text-ink-muted">{RUNWAY_TEXT.next}</span>{" "}
            <Link href={card.next.href} className={TILE_LINK}>
              {card.next.title}
            </Link>
          </>
        ) : (
          <span className="text-ink-muted">{RUNWAY_TEXT.noNext}</span>
        )}
      </p>
      <p className="text-sm text-ink">
        <StatusLight compact tone={card.checked.tone} label={card.checked.phrase} />
      </p>
      {card.highlights.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-ink">
          {card.highlights.map((highlight) => (
            <li key={highlight.term}>
              <Term id={highlight.term}>{highlight.text}</Term>
            </li>
          ))}
        </ul>
      )}
      {card.contentLine && (
        <p className="text-sm">
          <Link href="/content" className={TILE_LINK}>
            {card.contentLine}
          </Link>
        </p>
      )}
      <p className="mt-auto text-xs text-ink-muted">{card.claudeLine}</p>
    </article>
  );
}
