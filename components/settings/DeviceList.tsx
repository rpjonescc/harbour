"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { postJson } from "@/lib/auth/client-api";
import type { DeviceSummary } from "@/lib/auth/devices";
import { formatDateTime } from "@/lib/format/date";

// Zone and locale come from the server so server and client render the same date
// (no hydration mismatch).
const fmt = (d: Date, timeZone: string, locale: string) =>
  formatDateTime(new Date(d), timeZone, locale);

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
    const warning = device.current ? " You will be signed out on this device." : "";
    const question = `Remove “${device.deviceLabel}” from Harbour? That device won't be able to sign in any more.`;
    if (!window.confirm(question + warning)) return;
    const result = await postJson("/api/devices/remove", { id: device.id });
    if (!result.ok) return setError("Couldn't remove that device. Try again.");
    if (device.current) return router.replace("/login");
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center gap-4 py-3">
            <div className="flex-1">
              <p className="flex items-center gap-2 text-sm">
                {device.deviceLabel}
                {device.current && <Tag tone="neutral">This device</Tag>}
              </p>
              <p className="text-xs text-ink-muted">
                Added {fmt(device.createdAt, timeZone, locale)} ·{" "}
                {device.lastUsedAt
                  ? `last used ${fmt(device.lastUsedAt, timeZone, locale)}`
                  : "not used yet"}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => remove(device)}
              aria-label={`Remove ${device.deviceLabel}, added ${fmt(device.createdAt, timeZone, locale)}`}
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
