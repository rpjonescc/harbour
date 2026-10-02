import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { CostMeter } from "@/components/today/CostMeter";
import { DocsLink } from "@/components/ui/DocsLink";
import { formatAud } from "@/lib/costs/budget";
import { DOCS_LINKS } from "@/lib/docs-links";
import { SETTINGS_PURPOSE } from "@/lib/explain/settings";
import type { SettingsView } from "@/lib/settings/view";
import { BudgetReservations } from "./BudgetReservations";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

type Props = Pick<SettingsView, "budget" | "reservations"> & {
  now: Date;
  timeZone: string;
  locale: string;
  section?: SectionPlacement;
  /** Tells this card's Technical details apart when several share a page (the /design examples). */
  which?: string;
};

/** The monthly limit on paid data, this month's spend and any calls still being counted. */
export function BudgetCard({ budget, reservations, now, timeZone, locale, section, which }: Props) {
  const aud = (micro: number) => formatAud(micro, locale);
  const suffix = which ? ` (${which})` : "";
  return (
    <SettingsSection {...section} title="Budget" purpose={SETTINGS_PURPOSE.budget}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Most Harbour may spend</dt>
        <dd>
          {budget.capMicro > 0
            ? `${aud(budget.capMicro)} a month`
            : `${aud(0)} — paid data is switched off`}
        </dd>
      </dl>
      {/* Spend, projection and state: the same meter as Today, so the two never disagree. */}
      <CostMeter view={budget} now={now} timeZone={timeZone} locale={locale} />
      {reservations.length > 0 && (
        <BudgetReservations
          reservations={reservations}
          timeZone={timeZone}
          locale={locale}
          suffix={suffix}
        />
      )}
      <TechnicalDetails id="budget-setup" topic={`how to change the monthly budget${suffix}`}>
        <p>
          Set <code className="font-mono">HARBOUR_MONTHLY_BUDGET_AUD</code> in{" "}
          <code className="font-mono">.env</code> and restart Harbour.{" "}
          <DocsLink href={DOCS_LINKS.costs}>How costs and the budget work</DocsLink>
        </p>
      </TechnicalDetails>
    </SettingsSection>
  );
}
