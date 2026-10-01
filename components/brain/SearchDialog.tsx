"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { SearchHit } from "@/lib/brain/search";
import { brainHref } from "@/lib/brain/wikilinks";
import { useBrainSearch } from "./useBrainSearch";

/** ⌘K / Ctrl+K command dialog searching every brain document. */
export function SearchDialog() {
  const router = useRouter();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { hits, loading, error } = useBrainSearch(open ? query : "");

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !hits[active]) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, hits, active, listId]);

  function close() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    router.push(brainHref(hit.path));
  }

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) go(hit);
    } else if (event.key === "Escape") {
      close();
    } else if (event.key === "Tab") {
      event.preventDefault(); // keep focus inside the dialog
    }
  }

  const status = error
    ? null
    : loading
      ? "Searching…"
      : query.trim() && hits.length === 0
        ? "No results"
        : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <Search aria-hidden="true" className="size-4" />
        <span>Search</span>
        <kbd className="font-mono text-2xs">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24">
          <button
            type="button"
            aria-label="Close search"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 bg-ink/20"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search the Second Brain"
            className="relative w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
          >
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Search the Second Brain"
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder="Search notes…"
              className="w-full border-b border-line bg-surface px-4 py-3 text-base outline-none"
            />
            <div
              id={listId}
              role="listbox"
              aria-label="Results"
              className="max-h-96 overflow-y-auto"
            >
              {hits.map((hit, index) => (
                <div
                  key={hit.path}
                  id={`${listId}-${index}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(hit);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className="cursor-pointer px-4 py-2.5 aria-selected:bg-surface-sunk"
                >
                  <p className="text-sm text-ink">{hit.title}</p>
                  <p className="font-mono text-2xs text-ink-muted">{hit.path}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {hit.snippet.map((part, i) =>
                      part.hit ? (
                        // biome-ignore lint/suspicious/noArrayIndexKey: snippet parts are static per render
                        <mark key={i} className="bg-warn-soft text-ink">
                          {part.text}
                        </mark>
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: snippet parts are static per render
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </p>
                </div>
              ))}
            </div>
            {error && (
              <p role="alert" className="px-4 py-3 text-sm text-bad">
                {error}
              </p>
            )}
            <p aria-live="polite" className="px-4 py-2 text-xs text-ink-muted">
              {status}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
