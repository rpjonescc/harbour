import Link from "next/link";
import { IMPACT_LABEL } from "@/components/actions/action-labels";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { productById } from "@/lib/products/catalog";
import type { ActionPreview } from "@/lib/today/types";

/** Compact action summary for Today; a real one links to the product's issues. */
export function ActionCard({ action, linked }: { action: ActionPreview; linked: boolean }) {
  const product = productById(action.productId);
  return (
    <Panel className="p-4">
      <article aria-labelledby={`action-${action.id}`}>
        <Tag tone={action.impact === "high" ? "warn" : "neutral"}>
          {IMPACT_LABEL[action.impact]}
        </Tag>
        <h3 id={`action-${action.id}`} className="mt-2 text-sm text-ink">
          {linked ? (
            <Link href={`/products/${product.id}#issues`} className="rounded-sm hover:text-accent">
              {action.title}
            </Link>
          ) : (
            action.title
          )}
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          {product.name} · {action.area} · {action.detail}
        </p>
      </article>
    </Panel>
  );
}
