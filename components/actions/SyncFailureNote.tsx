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
          {productName}: the list below may be out of date. The last check finished, but Harbour
          couldn't update the actions ({formatDateTime(at, timeZone, locale)}). The next check tries
          again.
        </li>
      ))}
    </ul>
  );
}
