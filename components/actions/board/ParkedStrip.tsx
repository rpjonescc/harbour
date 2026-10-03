import { Explainer } from "@/components/explain/Explainer";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import { statusChip } from "@/lib/explain/actions";
import { explainerItems, PARKED_COPY } from "@/lib/explain/board";
import { formatIsoDay } from "@/lib/format/date";
import { ActionStatusControls } from "../ActionStatusControls";
import { cardTitleId, PARKED_HEADING_ID } from "../focus-after-change";
import type { BoardCardView } from "./card-view";

/**
 * The quiet strip under the board: snoozed cards and recently dismissed ones, each with the
 * usual buttons to bring it back (or finish it). Parked cards are in no column, so no Move to….
 */
export function ParkedStrip({
  cards,
  locale,
  today,
  demo,
}: {
  cards: readonly BoardCardView[];
  locale: string;
  today: string;
  demo: boolean;
}) {
  return (
    <section aria-labelledby={PARKED_HEADING_ID} className="flex flex-col gap-3">
      <h2 id={PARKED_HEADING_ID} tabIndex={-1} className="font-serif text-xl">
        {PARKED_COPY.name}
      </h2>
      <Explainer
        topic={PARKED_COPY.name}
        oneLiner={PARKED_COPY.short}
        items={explainerItems(PARKED_COPY.explainer)}
      />
      {cards.length === 0 ? (
        <p className="text-sm text-ink-muted">{PARKED_COPY.empty}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id}>
              <article
                id={`action-${card.id}`}
                aria-labelledby={cardTitleId(card.id)}
                data-action-id={card.id}
                data-group-heading={PARKED_HEADING_ID}
                className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3"
              >
                <h3 id={cardTitleId(card.id)} tabIndex={-1} className="font-medium text-ink">
                  {card.title}
                </h3>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  <ProductDot product={card} />
                  <span>{card.productName}</span>
                  <Tag tone="neutral">
                    {statusChip(card, (day) => formatIsoDay(day, locale)).text}
                  </Tag>
                </p>
                <ActionStatusControls
                  id={card.id}
                  title={card.title}
                  status={card.status}
                  today={today}
                  demo={demo}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
