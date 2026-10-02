"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/auth/client-api";
import { refusalMessage } from "@/lib/explain/content";

const POLL_MS = 2000;

/**
 * Sends one decision to /api/content (it only queues work for the worker) and says calmly why
 * when it is refused. While a decision is waiting the page is refreshed every two seconds, and
 * nothing else on it changes.
 */
export function useContentDecision(saving: boolean) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!saving) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [saving, router]);

  async function send(body: Record<string, unknown>, onSent: () => void) {
    setBusy(true);
    setError("");
    const result = await postJson<{ jobIds: number[] }>("/api/content", body);
    setBusy(false);
    if (!result.ok) return setError(refusalMessage(result.error, result.message));
    onSent();
    router.refresh();
  }
  return { busy, error, clearError: () => setError(""), send };
}
