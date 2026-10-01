/** Makes it impossible to mistake placeholder numbers for real data. */
export function SampleBanner() {
  return (
    <p role="note" className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-warn">
      Sample data — real scores arrive when the daily scan is built (Phase 3).
    </p>
  );
}
