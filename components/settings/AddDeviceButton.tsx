"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

/** Creates a one-time setup link to open on a new device. */
export function AddDeviceButton() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const result = await postJson<{ url: string }>("/api/devices/setup-link");
    if (result.ok) setLink(result.data.url);
    else setError("Couldn't create a setup link. Try again.");
  }

  return (
    <div className="space-y-3">
      <Button onClick={create}>Add a device</Button>
      {link && (
        <div className="space-y-1">
          <p className="text-sm text-ink-muted">
            Open this on the new device within 15 minutes. It works once.
          </p>
          <input
            readOnly
            aria-label="Setup link"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-xs"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
