"use client";

import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

const MESSAGES: Record<string, string> = {
  invalid_setup_token: "This setup link has expired or was already used. Create a new one.",
  network_error: "Couldn't reach Harbour. Check Tailscale is connected.",
};

/** Registers this device's passkey using a one-time setup token. */
export function PasskeySetup({ setupToken }: { setupToken: string }) {
  const router = useRouter();
  const labelId = useId();
  const [deviceLabel, setDeviceLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAs, setSavedAs] = useState<string | null>(null);

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
      "/api/auth/register/options",
      { setupToken },
    );
    if (!options.ok) return fail(options.error);
    try {
      const response = await startRegistration({ optionsJSON: options.data });
      const verified = await postJson<{ deviceLabel: string; renamed: boolean }>(
        "/api/auth/register/verify",
        { response, deviceLabel },
      );
      if (!verified.ok) return fail(verified.error);
      if (verified.data.renamed) {
        setBusy(false);
        return setSavedAs(verified.data.deviceLabel);
      }
      router.replace("/");
    } catch {
      fail("cancelled");
    }
  }

  function fail(code: string) {
    setBusy(false);
    setError(MESSAGES[code] ?? "Passkey setup didn't complete. Create a new setup link and retry.");
  }

  if (savedAs) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Saved as “{savedAs}” because that name was already used.
        </p>
        <Button onClick={() => router.replace("/")} className="w-full justify-center">
          Continue
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={register} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={labelId} className="text-sm text-ink-muted">
          Name this device
        </label>
        <input
          id={labelId}
          required
          maxLength={60}
          value={deviceLabel}
          onChange={(e) => setDeviceLabel(e.target.value)}
          placeholder="e.g. MacBook, Pixel"
          className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full justify-center">
        {busy ? "Waiting for passkey…" : "Create passkey"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
