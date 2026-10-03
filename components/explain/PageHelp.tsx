"use client";

import { CircleHelp } from "lucide-react";
import { useId, useRef } from "react";
import { termsFor } from "@/lib/explain/glossary";
import { PAGE_HELP, type PageId } from "@/lib/explain/page-help";
import { usePageHelp } from "./usePageHelp";

const LABEL = "text-xs font-medium text-ink";

/**
 * "What's this page?": a disclosure (not a modal) with what the page is for, how to read it, what
 * to do first and the meaning of every word it uses. `?` opens it when you are not typing.
 */
export function PageHelp({ page }: { page: PageId }) {
  const copy = PAGE_HELP[page];
  const terms = termsFor(copy.terms);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { open, toggle } = usePageHelp({ root, button, panel });
  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-keyshortcuts="?"
        onClick={toggle}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-sm text-accent hover:underline"
      >
        <CircleHelp aria-hidden="true" className="size-4" />
        What's this page?
      </button>
      <div
        ref={panel}
        id={panelId}
        hidden={!open}
        tabIndex={-1}
        className="absolute right-0 top-full z-20 mt-1 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-4 text-left font-sans text-sm font-normal text-ink shadow-overlay"
      >
        <div className="flex flex-col gap-3">
          <p>{copy.purpose}</p>
          <div>
            <p className={LABEL}>How to read it</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-ink-muted">
              {copy.howToRead.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className={LABEL}>What to do first</p>
            <p className="mt-1 text-ink-muted">{copy.firstStep}</p>
          </div>
          {terms.length > 0 && (
            <div>
              <p className={LABEL}>Words on this page</p>
              <dl className="mt-1 flex flex-col gap-1.5">
                {terms.map((term) => (
                  <div key={term.word}>
                    <dt className="font-medium">{term.word}</dt>
                    <dd className="text-ink-muted">{term.meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
