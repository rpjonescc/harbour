import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { EFFORT_PHRASE, IMPACT_PHRASE, WHO_PHRASE } from "@/lib/explain/actions";
import { AREAS, areaKeyOf } from "@/lib/explain/areas";
import { productById } from "@/lib/products/catalog";
import type { ActionPreview } from "@/lib/today/types";

/** One thing worth doing: what, why, how big a job, and who's on it; links to its board card. */
export function ActionCard({ action }: { action: ActionPreview }) {
  const product = productById(action.productId);
  const titleId = `today-action-${action.id}`;
  return (
    <Panel className="p-4">
      <article aria-labelledby={titleId} className="flex flex-col gap-1.5">
        <p className="flex flex-wrap gap-1.5">
          <Tag tone={action.impact === "high" ? "accent" : "neutral"}>
            {IMPACT_PHRASE[action.impact]}
          </Tag>
          <Tag tone="neutral">
            {AREAS[areaKeyOf(action.area)].name} · {EFFORT_PHRASE[action.effort]}
          </Tag>
        </p>
        <h3 id={titleId} className="text-base text-ink">
          {action.href ? (
            <Link href={action.href} className="rounded-sm hover:text-accent">
              {action.title}
            </Link>
          ) : (
            action.title
          )}
        </h3>
        {action.reason && <p className="text-sm text-ink-muted">{action.reason}</p>}
        <p className="text-xs text-ink-muted">
          {product.name}
          {action.who && (
            <>
              {" · "}
              <span className="text-ink">{WHO_PHRASE[action.who]}</span>
            </>
          )}
        </p>
      </article>
    </Panel>
  );
}
