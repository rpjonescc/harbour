"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { type FourParts, PART_LABELS, PART_ORDER } from "@/lib/explain/four-parts";

type Props = {
  /** What it explains, e.g. "Found on Google": names the button for screen readers. */
  topic: string;
  oneLiner: string;
  parts: FourParts;
  /** Where to act on it, e.g. the matching actions. */
  nextStep?: { href: string; label: string };
};

/** One plain sentence, always visible, and a "What's this?" disclosure with the four parts. */
export function Explainer({ topic, oneLiner, parts, nextStep }: Props) {
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
          {PART_ORDER.map((part) => (
            <div key={part}>
              <dt className="text-xs font-medium text-ink">{PART_LABELS[part]}</dt>
              <dd className="text-sm text-ink-muted">{parts[part]}</dd>
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
