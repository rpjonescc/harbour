import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { formatAudPrecise } from "@/lib/costs/budget";
import { sourceName } from "@/lib/explain/sources";
import { formatShortDateTime } from "@/lib/format/date";
import type { SettingsView } from "@/lib/settings/view";

/** Paid calls whose cost is still only an estimate (in flight, or cut short by a crash). */
export function BudgetReservations({
  reservations,
  timeZone,
  locale,
}: Pick<SettingsView, "reservations"> & { timeZone: string; locale: string }) {
  const n = reservations.length;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-ink-muted">
        {n} paid {n === 1 ? "call is" : "calls are"} still being counted.
      </p>
      <TechnicalDetails id="budget-reservations" topic="paid calls still being counted">
        <p className="mb-2 text-ink-muted">
          Each counts against the budget at its estimate until its call is settled.
        </p>
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Paid calls still being counted this month</caption>
          <thead className="text-ink-muted">
            <tr className="border-b border-line">
              {["Reserved", "Source", "Product", "Run", "Set aside"].map((label) => (
                <th key={label} scope="col" className="py-1.5 pr-3 font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3">
                  {formatShortDateTime(r.createdAt, timeZone, locale)}
                </td>
                <td className="py-1.5 pr-3">{sourceName(r.collector)}</td>
                <td className="py-1.5 pr-3">{r.productId ?? "—"}</td>
                <td className="py-1.5 pr-3">
                  {r.jobId === null ? (
                    "—"
                  ) : (
                    <Link
                      href={`/agents/${r.jobId}`}
                      className="rounded-sm text-accent hover:underline"
                    >
                      Job {r.jobId}
                    </Link>
                  )}
                </td>
                <td className="py-1.5 tabular-nums">
                  {formatAudPrecise(r.amountMicroAud, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TechnicalDetails>
    </div>
  );
}
