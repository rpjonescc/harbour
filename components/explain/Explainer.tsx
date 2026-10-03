"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { type FourParts, PART_LABELS, PART_ORDER } from "@/lib/explain/four-parts";

/** One labelled part behind "What's this?". */
export type ExplainerItem = { label: string; text: string };

type Props = {
  /** What it explains, e.g. "Found on Google": names the button for screen readers. */
  topic: string;
  oneLiner: string;
  /** Where to act on it, e.g. the matching actions. */
  nextStep?: { href: string; label: string };
} & (
  | { parts: FourParts; items?: never }
  /** Parts with their own headings, e.g. a board column's (who moves cards, if one is stuck). */
  | { items: readonly ExplainerItem[]; parts?: never }
);

function itemsOf(props: Props): readonly ExplainerItem[] {
  if (props.items) return props.items;
  const { parts } = props;
  return PART_ORDER.map((part) => ({ label: PART_LABELS[part], text: parts[part] }));
}

/** One plain sentence, always visible, and a "What's this?" disclosure with its parts. */
export function Explainer(props: Props) {
  const { topic, oneLiner, nextStep } = props;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-ink">
        <span>{oneLiner}</span>{" "}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((was) => !was)}
          className="rounded-sm text-xs text-accent underline underline-offset-2"
        >
          What's this? <span className="sr-only">({topic})</span>
        </button>
      </p>
      <div id={panelId} hidden={!open} className="rounded-md bg-surface-sunk p-3">
        <dl className="flex flex-col gap-2">
          {itemsOf(props).map(({ label, text }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-ink">{label}</dt>
              <dd className="text-sm text-ink-muted">{text}</dd>
            </div>
          ))}
        </dl>
        {nextStep && (
          <p className="mt-3 text-sm">
            <Link
              href={nextStep.href}
              className="rounded-sm text-accent underline underline-offset-2"
            >
              {nextStep.label}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
