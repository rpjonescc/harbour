import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { DOCS_LINKS } from "@/lib/docs-links";
import { SETTINGS_INTRO, SETTINGS_PURPOSE } from "@/lib/explain/settings";
import type { SettingsView } from "@/lib/settings/view";
import { BackupCard } from "./BackupCard";
import { BudgetCard } from "./BudgetCard";
import { KeyStatusCard } from "./KeyStatusCard";
import { ProductsCard } from "./ProductsCard";
import { SchedulesCard } from "./SchedulesCard";
import { SettingsSection } from "./SettingsSection";

const LINK = "rounded-sm text-accent hover:underline";

/** The Settings page: a read-only overview of products, schedules, keys, budget and backups. */
export function SettingsOverview({
  view,
  now,
  locale,
}: {
  view: SettingsView;
  now: Date;
  locale: string;
}) {
  const { timeZone } = view;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="text-sm text-ink-muted">{SETTINGS_INTRO.line}</p>
        <TechnicalDetails id="settings-files" topic="where settings live">
          <p>
            {SETTINGS_INTRO.files}{" "}
            <DocsLink href={DOCS_LINKS.configuration}>Configuration</DocsLink>
          </p>
        </TechnicalDetails>
      </header>
      <ProductsCard
        section={{ anchor: "products" }}
        products={view.products}
        isDemoConfig={view.isDemoConfig}
      />
      <SchedulesCard
        section={{ anchor: "schedules" }}
        schedules={view.schedules}
        timeZone={timeZone}
        locale={locale}
      />
      <KeyStatusCard section={{ anchor: "keys" }} keys={view.keys} />
      <BudgetCard
        section={{ anchor: "budget" }}
        budget={view.budget}
        reservations={view.reservations}
        now={now}
        timeZone={timeZone}
        locale={locale}
      />
      <BackupCard
        section={{ anchor: "backups" }}
        backups={view.backups}
        backupDirSet={view.backupDirSet}
        timeZone={timeZone}
        locale={locale}
      />
      <SettingsSection anchor="more" title="More settings" purpose={SETTINGS_PURPOSE.more}>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link href="/settings/sources" className={LINK}>
              Sources
            </Link>
          </li>
          <li>
            <Link href="/settings/devices" className={LINK}>
              Devices
            </Link>
          </li>
          {view.products.map((product) => (
            <li key={product.id}>
              <Link href={`/settings/products/${product.id}`} className={LINK}>
                {product.name} research targets
              </Link>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
