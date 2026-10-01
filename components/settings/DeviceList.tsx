"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";
import type { DeviceSummary } from "@/lib/auth/devices";

// Zone and locale come from the server so server and client render the same date
// (no hydration mismatch).
const fmt = (d: Date | null, timeZone: string, locale: string) =>
  d ? new Date(d).toLocaleDateString(locale, { timeZone }) : "never";

/** Registered passkeys with a remove control for lost devices. */
export function DeviceList({
  devices,
  timeZone,
  locale,
}: {
  devices: DeviceSummary[];
  timeZone: string;
  locale: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove(device: DeviceSummary) {
    setError(null);
    if (!window.confirm(`Remove the passkey for “${device.deviceLabel}”?`)) return;
    const result = await postJson("/api/devices/remove", { id: device.id });
    if (!result.ok) return setError("Couldn't remove that device.");
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center gap-4 py-3">
            <div className="flex-1">
              <p className="text-sm">{device.deviceLabel}</p>
              <p className="text-xs text-ink-muted">
                Added {fmt(device.createdAt, timeZone, locale)} · last used{" "}
                {fmt(device.lastUsedAt, timeZone, locale)}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => remove(device)}
              aria-label={`Remove ${device.deviceLabel}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
