import type { ActionFilter, ActionGroup } from "@/lib/actions/views";
import type { Product } from "@/lib/products/catalog";
import { ActionAnnouncer } from "./ActionAnnouncer";
import { ActionCard } from "./ActionCard";
import { EMPTY_MESSAGE, IMPACT_LABEL } from "./action-labels";

/** The filtered actions, one section per impact, with what the cap left out. */
export function ActionBoard({
  groups,
  more,
  filter,
  products,
  locale,
  timeZone,
  today,
}: {
  groups: ActionGroup[];
  more: number;
  filter: ActionFilter;
  products: readonly Product[];
  locale: string;
  timeZone: string;
  today: string;
}) {
  const byId = new Map(products.map((product) => [product.id, product]));
  // The announcer wraps the empty state too: moving the last card away still confirms.
  return (
    <ActionAnnouncer>
      {groups.length === 0 ? (
        <p className="text-sm text-ink-muted">{EMPTY_MESSAGE[filter.status]}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ impact, actions }) => (
            <section
              key={impact}
              aria-labelledby={`impact-${impact}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`impact-${impact}`} tabIndex={-1} className="font-serif text-xl">
                {IMPACT_LABEL[impact]}
              </h2>
              {actions.map((action) => {
                const product = byId.get(action.productId);
                // The board only lists configured products; a stray row is skipped, not guessed.
                if (!product) return null;
                return (
                  <ActionCard
                    key={action.id}
                    action={action}
                    product={product}
                    locale={locale}
                    timeZone={timeZone}
                    today={today}
                  />
                );
              })}
            </section>
          ))}
          {more > 0 && (
            <p className="text-sm text-ink-muted">{more} more not shown — narrow the filter</p>
          )}
        </div>
      )}
    </ActionAnnouncer>
  );
}
