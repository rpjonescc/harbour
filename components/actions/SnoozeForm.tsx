"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MAX_SNOOZE_DAYS } from "@/lib/actions/transitions";
import { addIsoDays } from "@/lib/format/date";

/**
 * Picks the day an action comes back: tomorrow at the earliest, a year at the latest (the
 * server checks the same range). Focus moves into the field when the form opens;
 * Escape on the buttons cancels.
 */
export function SnoozeForm({
  id,
  title,
  today,
  busy,
  onSnooze,
  onCancel,
}: {
  id: number;
  title: string;
  /** YYYY-MM-DD in HARBOUR_TIMEZONE. */
  today: string;
  busy: boolean;
  onSnooze: (until: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const min = addIsoDays(today, 1);
  const max = addIsoDays(today, MAX_SNOOZE_DAYS);
  const fieldId = `snooze-until-${id}`;
  const errorId = `snooze-error-${id}`;

  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const until = input.current?.value ?? "";
    // ISO dates compare correctly as strings.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < min || until > max) {
      setError("Pick a date between tomorrow and a year from now.");
      input.current?.focus();
      return;
    }
    setError(null);
    onSnooze(until);
  }

  return (
    <form
      id={`snooze-${id}`}
      onSubmit={submit}
      onKeyDown={(event) => {
        // In the date field Escape belongs to the browser's picker.
        if (event.key === "Escape" && event.target !== input.current) onCancel();
      }}
      noValidate
      className="flex flex-wrap items-end gap-2 rounded-sm bg-surface-sunk p-2"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId} className="text-xs text-ink-muted">
          Snooze until
        </label>
        <input
          ref={input}
          id={fieldId}
          type="date"
          min={min}
          max={max}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="rounded-sm border border-line bg-surface px-2 py-1 text-sm text-ink"
        />
      </div>
      <Button type="submit" disabled={busy} aria-label={`Snooze: ${title}`}>
        Snooze
      </Button>
      <Button variant="ghost" onClick={onCancel} aria-label={`Cancel snooze: ${title}`}>
        Cancel
      </Button>
      {error && (
        <p id={errorId} role="alert" className="w-full text-xs text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
