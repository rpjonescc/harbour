import { TechnicalDetails } from "@/components/explain/TechnicalDetails";

/** Shown while interrupted agent runs still need their changes moved to quarantine. */
export function RecoveryBanner({
  pending,
  lastError,
}: {
  pending: readonly string[];
  lastError: string | null;
}) {
  if (pending.length === 0) return null;
  const runs = pending.length === 1 ? "1 run was" : `${pending.length} runs were`;
  return (
    <section
      aria-label="Agent run recovery"
      className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink"
    >
      <p>
        {runs} interrupted. Harbour is putting your notes back in order, so saving is paused for a
        moment.
      </p>
      {lastError && (
        <TechnicalDetails
          id="recovery-error"
          topic="what Harbour recorded about the interrupted run"
        >
          <p className="whitespace-pre-line break-words font-mono text-bad">{lastError}</p>
        </TechnicalDetails>
      )}
    </section>
  );
}
