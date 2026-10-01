import type { ReactNode } from "react";
import { BackupCard } from "@/components/settings/BackupCard";
import { BudgetCard } from "@/components/settings/BudgetCard";
import { KeyStatusCard } from "@/components/settings/KeyStatusCard";
import { ProductsCard } from "@/components/settings/ProductsCard";
import { SchedulesCard } from "@/components/settings/SchedulesCard";
import { BackupNotice } from "@/components/today/BackupNotice";
import { CostMeter } from "@/components/today/CostMeter";
import type { BackupHealth } from "@/lib/ops/backup-status";
import {
  EXAMPLE_BACKUPS,
  EXAMPLE_METERS,
  EXAMPLE_SETTINGS,
  EXAMPLE_ZONE,
} from "./ops-example-data";

const HEALTHS: BackupHealth[] = ["ok", "none-yet", "failed", "stale", "off", "unreadable"];
/** Nested under the design page's "Operations examples" heading, without fragment ids. */
const NESTED = { level: 3 } as const;
const { timeZone, locale, now } = EXAMPLE_ZONE;

function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xs uppercase tracking-widest text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

/**
 * Fictional operations pieces: Today's cost meter and backup notices, and the Settings cards
 * in each state. Back up now is demo-only here: it never calls the API.
 */
export function OpsExamples() {
  const view = EXAMPLE_SETTINGS;
  return (
    <div className="flex flex-col gap-6">
      {EXAMPLE_METERS.map(({ label, view: meter }) => (
        <Example key={label} label={`Cost meter · ${label}`}>
          <CostMeter view={meter} {...EXAMPLE_ZONE} />
        </Example>
      ))}
      <Example label="Today backup notice · failed">
        <BackupNotice backup={EXAMPLE_BACKUPS.failed} timeZone={timeZone} locale={locale} />
      </Example>
      <Example label="Today backup notice · failed, nightly backups off">
        <BackupNotice
          backup={{ ...EXAMPLE_BACKUPS.failed, enabled: false, next: null }}
          timeZone={timeZone}
          locale={locale}
        />
      </Example>
      <Example label="Today backup notice · stale">
        <BackupNotice backup={EXAMPLE_BACKUPS.stale} timeZone={timeZone} locale={locale} />
      </Example>
      <Example label="Today backup notice · folder unreadable">
        <BackupNotice backup={EXAMPLE_BACKUPS.unreadable} timeZone={timeZone} locale={locale} />
      </Example>
      <ProductsCard section={NESTED} products={view.products} isDemoConfig={false} />
      <ProductsCard section={NESTED} products={view.products.slice(0, 1)} isDemoConfig />
      <SchedulesCard
        section={NESTED}
        schedules={view.schedules}
        timeZone={timeZone}
        locale={locale}
      />
      <KeyStatusCard section={NESTED} keys={view.keys} />
      <BudgetCard
        section={NESTED}
        budget={view.budget}
        reservations={view.reservations}
        {...EXAMPLE_ZONE}
      />
      <BudgetCard
        section={NESTED}
        budget={{ state: "no-budget", spentMicro: 0, unconfirmedMicro: 0, capMicro: 0 }}
        reservations={[]}
        now={now}
        timeZone={timeZone}
        locale={locale}
      />
      {HEALTHS.map((health) => (
        <BackupCard
          key={health}
          section={NESTED}
          backups={EXAMPLE_BACKUPS[health]}
          backupDirSet={health === "off"}
          timeZone={timeZone}
          locale={locale}
          demo
          buttonLabel={`Back up now (${health} example)`}
        />
      ))}
    </div>
  );
}
