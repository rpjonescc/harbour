import { formatDateTime } from "@/lib/format/date";

/** A scan whose action sync failed leaves the board behind it until the next scan syncs. */
export function SyncFailureNote({
  failures,
  timeZone,
  locale,
}: {
  failures: { productName: string; at: Date }[];
  timeZone: string;
  locale: string;
}) {
  if (failures.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-md bg-warn-soft px-3 py-2 text-sm text-ink">
      {failures.map(({ productName, at }) => (
        <li key={productName}>
          {productName} — Actions may be out of date: the last sync failed (
          {formatDateTime(at, timeZone, locale)})
        </li>
      ))}
    </ul>
  );
}
