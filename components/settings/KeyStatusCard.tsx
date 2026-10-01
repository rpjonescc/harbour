import { Tag } from "@/components/ui/Tag";
import type { KeyRow, KeyStatus } from "@/lib/settings/key-status";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const STATUS: Record<KeyStatus, { text: string; tone: "accent" | "warn" | "neutral" }> = {
  present: { text: "Present", tone: "accent" },
  missing: { text: "Missing", tone: "neutral" },
  "file-not-found": { text: "File not found", tone: "warn" },
};
const CELL = "py-2 pr-3 align-top";

/** Whether each key is set in .env: status only, never a value, a length or a file path. */
export function KeyStatusCard({ keys, section }: { keys: KeyRow[]; section?: SectionPlacement }) {
  return (
    <SettingsSection {...section} title="API keys">
      <p className="text-xs text-ink-muted">
        Keys live only in <code className="font-mono">.env</code> and are read by the worker. This
        page shows whether each one is set, never its value.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">API keys and whether each is set</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className={`${CELL} font-normal`}>
                Key
              </th>
              <th scope="col" className={`${CELL} font-normal`}>
                Used for
              </th>
              <th scope="col" className={`${CELL} font-normal`}>
                Setting
              </th>
              <th scope="col" className="py-2 align-top font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="border-b border-line last:border-0">
                <th scope="row" className={`${CELL} font-medium`}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {key.label}
                    {key.paid && <Tag tone="neutral">paid</Tag>}
                    {!key.inUse && <Tag tone="neutral">not used yet</Tag>}
                  </span>
                </th>
                <td className={`${CELL} text-ink-muted`}>{key.usedFor}</td>
                <td className={CELL}>
                  {key.settings.map((setting) => (
                    <code key={setting} className="block font-mono text-xs">
                      {setting}
                    </code>
                  ))}
                </td>
                <td className="py-2 align-top">
                  <Tag tone={STATUS[key.status].tone}>{STATUS[key.status].text}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
