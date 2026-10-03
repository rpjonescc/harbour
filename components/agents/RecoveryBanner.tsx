import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { RECOVERY_UNCHECKED } from "@/lib/explain/brain-sync";

/**
 * Shown while interrupted agent runs still need their changes moved to quarantine, or when
 * Harbour could not check for them (`pending` is null).
 */
export function RecoveryBanner({
  pending,
  lastError,
}: {
  pending: readonly string[] | null;
  lastError: string | null;
}) {
  if (pending !== null && pending.length === 0) return null;
  const runs = pending?.length === 1 ? "1 run was" : `${pending?.length} runs were`;
  return (
    <section
      aria-label="Agent run recovery"
      className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink"
    >
      <p>
        {pending === null
          ? RECOVERY_UNCHECKED
          : `${runs} interrupted. Harbour is putting your notes back in order, so saving is paused for a moment.`}
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
