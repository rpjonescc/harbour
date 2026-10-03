import { useId } from "react";
import { Explainer } from "@/components/explain/Explainer";
import { Tag } from "@/components/ui/Tag";
import {
  OUTSIDE_EMPTY,
  OUTSIDE_NOTICE,
  OUTSIDE_ONE_LINER,
  OUTSIDE_PARTS,
  OUTSIDE_TITLE,
} from "@/lib/explain/outside";
import type { OutsideView } from "@/lib/scan/outside-view";
import { OutsideCheckButton } from "./OutsideCheckButton";
import { OutsideFindings } from "./OutsideFindings";

/**
 * How the rest of the web sees the product: sites linking to it, where it ranks for the chosen
 * searches and whether ChatGPT names it. Unmeasured says so, never a zero. Everything shown from
 * stored data is plain text.
 */
export function OutsideViewPanel({
  view,
  productId,
  locale,
  idPrefix = "outside",
  demo = false,
}: {
  view: OutsideView;
  productId: string;
  locale: string;
  /** Distinct per panel on one page (/design shows several). */
  idPrefix?: string;
  demo?: boolean;
}) {
  const headingId = useId();
  const { state, notice } = view;
  const empty = state === "ready" ? null : notice ? OUTSIDE_NOTICE[notice] : OUTSIDE_EMPTY[state];
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-serif text-lg">
          {OUTSIDE_TITLE}
        </h2>
        {notice && state === "ready" && <Tag tone="warn">{OUTSIDE_NOTICE[notice]}</Tag>}
      </div>
      {empty && <p className="text-sm text-ink">{empty}</p>}
      {state === "ready" && <OutsideFindings view={view} locale={locale} idPrefix={idPrefix} />}
      <Explainer topic={OUTSIDE_TITLE} oneLiner={OUTSIDE_ONE_LINER} parts={OUTSIDE_PARTS} />
      {state !== "no_searches" && state !== "not_connected" && (
        <OutsideCheckButton
          productId={productId}
          active={view.check.active}
          refusal={view.check.refusal}
          demo={demo}
        />
      )}
    </section>
  );
}
