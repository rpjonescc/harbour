import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { SETTINGS_PURPOSE } from "@/lib/explain/settings";
import type { SettingsView } from "@/lib/settings/view";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

/** The content machine's products and where it listens for activity (read-only; shown when it is on). */
export function ContentCard({
  content,
  section,
}: {
  content: SettingsView["content"];
  section?: SectionPlacement;
}) {
  return (
    <SettingsSection {...section} title="Content machine" purpose={SETTINGS_PURPOSE.content}>
      {content.products.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No site or project has content switched on yet. Add it to harbour.config.json, then
          restart Harbour.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {content.products.map((product) => (
            <li key={product.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-xs text-ink-muted">Writes for {product.platforms.join(", ")}</p>
              <p className="text-xs text-ink-muted">Looks for: {product.terms.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
      <TechnicalDetails id="settings-content" topic="where Harbour looks for your recent activity">
        <p className="text-ink-muted">
          Screenpipe address: <code className="font-mono">{content.screenpipeUrl}</code>
        </p>
      </TechnicalDetails>
    </SettingsSection>
  );
}
