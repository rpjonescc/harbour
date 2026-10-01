/** Shown while interrupted agent runs still need their changes moved to quarantine. */
export function RecoveryBanner({
  pending,
  lastError,
}: {
  pending: readonly string[];
  lastError: string | null;
}) {
  if (pending.length === 0) return null;
  const runs =
    pending.length === 1 ? "1 interrupted agent run" : `${pending.length} interrupted agent runs`;
  return (
    <section
      aria-label="Agent run recovery"
      className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn"
    >
      <p>Recovering {runs} — notes autosave is paused</p>
      {lastError && (
        <p role="alert" className="whitespace-pre-line text-bad">
          {lastError}
        </p>
      )}
    </section>
  );
}
