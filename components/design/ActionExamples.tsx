import { ActionAnnouncer } from "@/components/actions/ActionAnnouncer";
import { ActionCard } from "@/components/actions/ActionCard";
import { ActionFilters } from "@/components/actions/ActionFilters";
import { ApprovalsNote } from "@/components/actions/ApprovalsNote";
import { STATUS_LABEL } from "@/components/actions/action-labels";
import { SyncFailureNote } from "@/components/actions/SyncFailureNote";
import { EXAMPLE_ACTIONS } from "./action-example-data";
import { EXAMPLE_PRODUCT } from "./scan-example-data";

const ZONE = { timeZone: "Europe/London", locale: "en-GB" };

/** Fictional Actions board pieces: filters, notices and one card per status. */
export function ActionExamples() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">
        Illustrative actions; the buttons are examples and change nothing.
      </p>
      <ActionFilters
        filter={{ productId: EXAMPLE_PRODUCT.id, area: null, status: "active" }}
        products={[EXAMPLE_PRODUCT]}
      />
      <SyncFailureNote
        failures={[{ productName: EXAMPLE_PRODUCT.name, at: new Date("2026-10-01T05:04:00Z") }]}
        {...ZONE}
      />
      <ApprovalsNote
        waiting={[{ productId: EXAMPLE_PRODUCT.id, productName: EXAMPLE_PRODUCT.name, count: 12 }]}
      />
      <ActionAnnouncer>
        {EXAMPLE_ACTIONS.map(({ status, action }) => (
          <div key={status} className="flex flex-col gap-1">
            <p className="text-2xs uppercase tracking-widest text-ink-muted">
              {STATUS_LABEL[status]}
            </p>
            <ActionCard
              action={action}
              product={EXAMPLE_PRODUCT}
              today="2026-10-02"
              demo
              {...ZONE}
            />
          </div>
        ))}
      </ActionAnnouncer>
    </div>
  );
}
