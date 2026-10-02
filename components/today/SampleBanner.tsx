/** Makes it impossible to mistake placeholder numbers for real data. */
export function SampleBanner() {
  return (
    <p role="note" className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
      Sample data — real scores replace it when the first check finishes. Open a product and choose{" "}
      <strong className="font-medium">Scan now</strong>, or wait for the daily check.
    </p>
  );
}
