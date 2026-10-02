import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";
import { keyPhrase, keyPurpose, keySteps } from "@/lib/explain/keys";
import { SETTINGS_PURPOSE } from "@/lib/explain/settings";
import type { KeyRow } from "@/lib/settings/key-status";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const CELL = "py-2 pr-3 align-top";
const DOCS: Record<string, { href: string; label: string } | undefined> = {
  pagespeed: { href: DOCS_LINKS.pagespeed, label: "Connect PageSpeed" },
  "search-console": { href: DOCS_LINKS.searchConsole, label: "Connect Search Console" },
};

function Setup({ row }: { row: KeyRow }) {
  const docs = DOCS[row.id];
  return (
    <TechnicalDetails id={`connect-${row.id}`} topic={`how to connect ${row.label}`}>
      <ol className="list-decimal pl-4">
        {keySteps(row.id).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {docs && <DocsLink href={docs.href}>{docs.label}</DocsLink>}
    </TechnicalDetails>
  );
}

/** Whether each account or key is connected: status and steps only, never a value or a path. */
export function KeyStatusCard({ keys, section }: { keys: KeyRow[]; section?: SectionPlacement }) {
  return (
    <SettingsSection {...section} title="Connections" purpose={SETTINGS_PURPOSE.connections}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Connections and whether each is connected</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className={`${CELL} font-normal`}>
                Connection
              </th>
              <th scope="col" className={`${CELL} font-normal`}>
                What it does
              </th>
              <th scope="col" className="py-2 align-top font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((row) => {
              const phrase = keyPhrase(row);
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <th scope="row" className={`${CELL} font-medium`}>
                    {row.label}
                    {row.paid && (
                      <span className="ml-1.5">
                        <Tag tone="neutral">paid</Tag>
                      </span>
                    )}
                  </th>
                  <td className={`${CELL} text-ink-muted`}>{keyPurpose(row.id)}</td>
                  <td className="py-2 align-top">
                    <Tag tone={phrase.tone}>{phrase.text}</Tag>
                    {phrase.note && <p className="mt-1 text-xs text-ink">{phrase.note}</p>}
                    {row.inUse && !phrase.connected && (
                      <div className="mt-1">
                        <Setup row={row} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
