"use client";

import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

const MESSAGES: Record<string, string> = {
  no_passkeys: "No passkey yet. Run `pnpm setup-token` on the Harbour PC to get a setup link.",
  network_error: "Couldn't reach Harbour. Check Tailscale is connected.",
};

/** Sign-in button: runs the WebAuthn assertion ceremony. */
export function PasskeyLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const options =
      await postJson<PublicKeyCredentialRequestOptionsJSON>("/api/auth/login/options");
    if (!options.ok) return fail(options.error);
    try {
      const response = await startAuthentication({ optionsJSON: options.data });
      const verified = await postJson("/api/auth/login/verify", { response });
      if (!verified.ok) return fail(verified.error);
      router.replace("/");
    } catch {
      fail("cancelled");
    }
  }

  function fail(code: string) {
    setBusy(false);
    setError(MESSAGES[code] ?? "Sign-in didn't complete. Try again.");
  }

  return (
    <div className="space-y-4">
      <Button onClick={signIn} disabled={busy} className="w-full justify-center">
        {busy ? "Waiting for passkey…" : "Sign in with passkey"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
