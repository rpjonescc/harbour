"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/auth/client-api";

/** Ends the session on this device. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    setPending(true);
    setFailed(false);
    const result = await postJson("/api/auth/logout");
    if (result.ok) {
      router.replace("/login");
      return;
    }
    setPending(false);
    setFailed(true);
  }
  return (
    <div>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-60"
      >
        <LogOut aria-hidden="true" className="size-4" />
        <span>Sign out</span>
      </button>
      {failed ? (
        <p role="alert" className="px-2 text-xs text-bad">
          Sign-out failed. Try again.
        </p>
      ) : null}
    </div>
  );
}
