import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { productById } from "@/lib/products/catalog";
import type { ActionPreview } from "@/lib/today/sample";

const IMPACT_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

/** Compact action summary for Today. Buttons arrive with the Actions board (Phase 4). */
export function ActionCard({ action }: { action: ActionPreview }) {
  return (
    <Panel className="p-4">
      <article aria-labelledby={`action-${action.id}`}>
        <Tag tone={action.impact === "high" ? "warn" : "neutral"}>
          {IMPACT_LABEL[action.impact]}
        </Tag>
        <h3 id={`action-${action.id}`} className="mt-2 text-sm text-ink">
          {action.title}
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          {productById(action.productId).name} · {action.area} · {action.effort}
        </p>
      </article>
    </Panel>
  );
}
