import { EmptyState } from "@/components/explain/EmptyState";
import type { ActionFilter, ActionGroup } from "@/lib/actions/views";
import { IMPACT_GROUP } from "@/lib/explain/actions";
import type { Product } from "@/lib/products/catalog";
import { ActionAnnouncer } from "./ActionAnnouncer";
import { ActionCard } from "./ActionCard";
import { EMPTY_STATE } from "./action-labels";

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
        <EmptyState {...EMPTY_STATE[filter.status]} />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ impact, actions }) => (
            <section
              key={impact}
              aria-labelledby={`impact-${impact}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`impact-${impact}`} tabIndex={-1} className="font-serif text-xl">
                {IMPACT_GROUP[impact]}
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
            <p className="text-sm text-ink-muted">
              {more} more aren't shown. Use the filters above to narrow the list.
            </p>
          )}
        </div>
      )}
    </ActionAnnouncer>
  );
}
