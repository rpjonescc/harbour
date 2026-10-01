import Link from "next/link";
import { CostMeter } from "@/components/today/CostMeter";
import { DocsLink } from "@/components/ui/DocsLink";
import { formatAud, formatAudPrecise } from "@/lib/costs/budget";
import { DOCS_LINKS } from "@/lib/docs-links";
import { formatShortDateTime } from "@/lib/format/date";
import type { SettingsView } from "@/lib/settings/view";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

type Props = Pick<SettingsView, "budget" | "reservations"> & {
  now: Date;
  timeZone: string;
  locale: string;
  section?: SectionPlacement;
};

/** The monthly cap on paid API calls, this month's spend and any unconfirmed reservations. */
export function BudgetCard({ budget, reservations, now, timeZone, locale, section }: Props) {
  const aud = (micro: number) => formatAud(micro, locale);
  return (
    <SettingsSection {...section} title="Budget">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Monthly cap</dt>
        <dd>
          <span>
            {budget.capMicro > 0 ? aud(budget.capMicro) : `${aud(0)} — no paid calls allowed`}
          </span>{" "}
          <code className="font-mono text-xs text-ink-muted">HARBOUR_MONTHLY_BUDGET_AUD</code>
        </dd>
      </dl>
      {/* Spend, projection and state: the same meter as Today, so the two never disagree. */}
      <CostMeter view={budget} now={now} timeZone={timeZone} locale={locale} />
      {reservations.length > 0 && (
        <Reservations {...{ reservations, timeZone, locale }} level={section?.level ?? 2} />
      )}
      <p className="text-xs text-ink-muted">
        <DocsLink href={DOCS_LINKS.costs}>How costs and the budget work</DocsLink>
      </p>
    </SettingsSection>
  );
}

/** Estimates still held for calls that never settled (in flight, or cut short by a crash). */
function Reservations({
  reservations,
  timeZone,
  locale,
  level,
}: Pick<Props, "reservations" | "timeZone" | "locale"> & { level: 2 | 3 }) {
  // One level below the card's own heading.
  const Heading = level === 2 ? "h3" : "h4";
  return (
    <div className="flex flex-col gap-1">
      <Heading className="text-sm font-medium">Unconfirmed reservations</Heading>
      <p className="text-xs text-ink-muted">
        Each counts against the budget at its estimate until its call is settled.
      </p>
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Unconfirmed reservations this month</caption>
        <thead className="text-ink-muted">
          <tr className="border-b border-line">
            {["Reserved", "Source", "Product", "Job", "Estimate"].map((label) => (
              <th key={label} scope="col" className="py-1.5 pr-3 font-normal">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reservations.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-3">{formatShortDateTime(r.createdAt, timeZone, locale)}</td>
              <td className="py-1.5 pr-3">{r.collector}</td>
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
              <td className="py-1.5 tabular-nums">{formatAudPrecise(r.amountMicroAud, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
