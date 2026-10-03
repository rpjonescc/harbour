import { DeviceList } from "@/components/settings/DeviceList";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { DeviceSummary } from "@/lib/auth/devices";
import { Example } from "./Example";

const DEVICES: DeviceSummary[] = [
  {
    id: "example-laptop",
    deviceLabel: "Example laptop",
    createdAt: new Date("2026-08-01T09:00:00Z"),
    lastUsedAt: new Date("2026-10-03T08:00:00Z"),
    current: true,
  },
  {
    id: "example-phone",
    deviceLabel: "Example phone",
    createdAt: new Date("2026-09-01T09:00:00Z"),
    lastUsedAt: null,
    current: false,
  },
];

/** The theme toggle (it changes the real theme for this device) and a fictional device list. */
export function SettingsExamples() {
  return (
    <div className="flex flex-col gap-6">
      <Example label="Theme toggle (system, light, dark)">
        <div>
          <ThemeToggle initial="system" />
        </div>
      </Example>
      <Example label="Signed-in devices">
        <DeviceList devices={DEVICES} timeZone="Europe/London" locale="en-GB" />
      </Example>
    </div>
  );
}
